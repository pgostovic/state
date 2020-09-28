import { createLogger } from '@phnq/log';
import React, { Component, ComponentType, createContext, ReactNode, useContext } from 'react';

const log = createLogger('@phnq/state');
const names = new Set<string>();
const providers: { [key: string]: Component<StateProviderProps> } = {};

declare global {
  interface Window {
    getCombinedState: <T = unknown>() => { [key: string]: T };
  }
}

if (!window.getCombinedState) {
  window.getCombinedState = () =>
    Object.keys(providers).reduce(
      (states, k) => ({
        ...states,
        [k]: providers[k].state,
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
  setState(subState: Partial<TState>): Promise<void>;
  resetState(): Promise<void>;
}

type VoidActions<T> = Record<keyof T, (...args: never[]) => void | Promise<void>>;

export const createState = <TState, TActions extends VoidActions<TActions>, TProviderProps = {}>(
  name: string,
  defaultState: TState,
  getActions: (getActionsParams: GetActionsParams<TState> & TProviderProps) => TActions,
  mapProvider: (Provider: ComponentType<TProviderProps>) => ComponentType = p => p as ComponentType,
) => {
  if (names.has(name)) {
    log.warn(
      `State '${name}' already exists. This may complicate debugging with getCombinedState(). Duplicate states may also be the result of hot module reloading which is no big deal.`,
    );
  }

  log('created state %s', name);
  names.add(name);

  const context = createContext({});

  const { Provider, Consumer } = context;

  class StateProvider extends Component<TProviderProps> {
    private consumerCount: number;
    private actions: TActions & {
      init?(): void;
      destroy?(): void;
      _incrementConsumerCount?(): void;
      _decrementConsumerCount?(): void;
    };

    constructor(props: TProviderProps) {
      super(props);
      providers[name] = this;
      this.consumerCount = 0;
      this.state = { ...defaultState };

      const getState = () => ({ ...this.state } as TState);
      const setState = (subState: Partial<TState>): Promise<void> => {
        log('%s(%d) - %o', name.toUpperCase(), this.consumerCount, subState);
        let res: (() => void) | undefined;
        const p = new Promise<void>(r => {
          res = r;
        });
        this.setState(subState, res);
        return p;
      };
      const resetState = () => setState(defaultState);

      this.actions = getActions({ ...props, getState, setState, resetState });

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
        isPhnqState: true,
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

  const MappedProvider = mapProvider(StateProvider);

  const provider = ((): any => (Wrapped: ComponentType): Wrapper => <T extends {}>(props: T): ReactNode => (
    <MappedProvider>
      <Wrapped {...props} />
    </MappedProvider>
  ))();

  const map = (mapFn = (s: any): any => s): any =>
    ((): HOC => (Wrapped: ComponentType): Wrapper => (props: any): JSX.Element => (
      <Consumer>
        {(state: { isPhnqState?: boolean }) => {
          if (!state.isPhnqState) {
            log.error(`No provider found for "${name}" state.`);
            throw new Error(`No provider found for "${name}" state.`);
          }
          return (
            <StateConsumer {...props} {...state}>
              <Wrapped {...props} {...mapFn(state)} ref={props.innerRef} />
            </StateConsumer>
          );
        }}
      </Consumer>
    ))();

  return { provider, consumer: map(), map, useState: () => useContext(context) as TState & TActions };
};

type Wrapper = <T extends {}>(props: T) => ReactNode;
type HOC = (Wrapped: any) => Wrapper;

export const inject = <T extends {}>() => ({} as T);
