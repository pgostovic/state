import { createLogger } from '@phnq/log';
import React, { Component, ComponentType, createContext } from 'react';

const log = createLogger('@phnq/state');
const names = new Set<string>();
const providers: { [key: string]: Component<StateProviderProps> } = {};

declare global {
  interface Window {
    getCombinedState: () => any;
  }
}

if (!window.getCombinedState) {
  window.getCombinedState = () =>
    Object.keys(providers).reduce(
      (states, k) => ({
        ...states,
        [k]: (providers[k] as any).state,
      }),
      {},
    );
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface StateProviderProps {}

interface StateConsumerProps {
  _incrementConsumerCount(): void;
  _decrementConsumerCount(): void;
}

interface GetActionsParams<TState> {
  getState(): TState;
  setState(subState: { [key in keyof TState]?: TState[key] }): void;
}

export const createState = <TState, TActions>(
  name: string,
  defaultState: TState,
  getActions: (getActionsParams: GetActionsParams<TState>) => TActions,
) => {
  if (names.has(name)) {
    throw new Error(`State names must be unique - '${name}' already exists`);
  }

  log('created state %s', name);
  names.add(name);

  const { Provider, Consumer } = createContext({});

  class StateProvider extends Component<StateProviderProps> {
    private consumerCount: number;
    private actions: TActions & {
      init?(): void;
      destroy?(): void;
      _incrementConsumerCount?(): void;
      _decrementConsumerCount?(): void;
    };

    constructor(props: StateProviderProps) {
      super(props);
      providers[name] = this;
      this.consumerCount = 0;
      this.state = defaultState as TState;
      this.actions = getActions({
        getState: () => ({ ...this.state } as TState),
        setState: subState => {
          log('%s(%d) - %o', name.toUpperCase(), this.consumerCount, subState);
          this.setState(subState);
        },
      });

      this.actions._incrementConsumerCount = () => {
        this.consumerCount += 1;
      };

      this.actions._decrementConsumerCount = () => {
        this.consumerCount -= 1;
      };

      const actions = this.actions as { [key: string]: () => void };
      Object.keys(actions).forEach(k => {
        actions[k] = actions[k].bind(this.actions);
      });

      this.actions = Object.freeze(this.actions);
    }

    public componentDidMount() {
      if (typeof this.actions.init === 'function') {
        this.actions.init();
      }
    }

    public componentWillUnmount() {
      if (typeof this.actions.destroy === 'function') {
        this.actions.destroy();
      }
    }

    public render() {
      const { children } = this.props;
      const value = {
        ...this.state,
        ...this.actions,
        consumerCount: this.consumerCount,
      };
      return <Provider value={value}>{children}</Provider>;
    }
  }

  class StateConsumer extends Component<StateConsumerProps> {
    public componentDidMount() {
      const { _incrementConsumerCount } = this.props;

      _incrementConsumerCount();
    }

    public componentWillUnmount() {
      const { _decrementConsumerCount } = this.props;

      _decrementConsumerCount();
    }

    public render() {
      const { children } = this.props;
      return children;
    }
  }

  const provider = ((): any => (Wrapped: ComponentType): Wrapper => (props: any): JSX.Element => (
    <StateProvider>
      <Wrapped {...props} />
    </StateProvider>
  ))();

  const map = (mapFn = (s: any): any => s): any =>
    ((): HOC => (Wrapped: ComponentType): Wrapper => (props: any): JSX.Element => (
      <Consumer>
        {state => (
          <StateConsumer {...props} {...state}>
            <Wrapped {...props} {...mapFn(state)} ref={props.innerRef} />
          </StateConsumer>
        )}
      </Consumer>
    ))();

  return { provider, consumer: map(), map };
};

type Wrapper = (props: any) => JSX.Element;
type HOC = (Wrapped: any) => Wrapper;

export const inject = <T extends {}>() => ({} as T);
