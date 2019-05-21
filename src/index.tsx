/* tslint:disable max-classes-per-file */

import { createLogger } from '@phnq/log';
import React, { Component, ComponentType, createContext } from 'react';

type IValue = string | number | boolean | IData | undefined;

interface IData {
  [key: string]: IValue | IValue[];
}

interface IReturnsVoid {
  [key: string]: (...args: any[]) => void;
}

const log = createLogger('phnq-lib.state');
const names = new Set<string>();
const providers: { [key: string]: Component<IStateProviderProps> } = {};

declare global {
  // tslint:disable-next-line: interface-name
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

// tslint:disable-next-line: no-empty-interface
interface IStateProviderProps {}

interface IStateConsumerProps {
  _incrementConsumerCount(): void;
  _decrementConsumerCount(): void;
}

interface IGetActionsParams<TState> {
  getState(): TState;
  setState(subState: { [key in keyof TState]?: TState[key] }): void;
}

export const createState = <TState, TActions>(
  name: string,
  defaultState: TState & IData,
  getActions: (
    getActionsParams: IGetActionsParams<TState>,
  ) => TActions & IReturnsVoid,
) => {
  if (names.has(name)) {
    throw new Error(`State names must be unique - '${name}' already exists`);
  }

  log('created state %s', name);
  names.add(name);

  const { Provider, Consumer } = createContext({});

  class StateProvider extends Component<IStateProviderProps> {
    private consumerCount: number;
    private actions: TActions &
      IReturnsVoid & {
        _incrementConsumerCount?(): void;
        _decrementConsumerCount?(): void;
      };

    constructor(props: IStateProviderProps) {
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

      Object.keys(this.actions).forEach(k => {
        this.actions[k] = this.actions[k].bind(this.actions);
      });

      this.actions._incrementConsumerCount = () => {
        this.consumerCount += 1;
      };

      this.actions._decrementConsumerCount = () => {
        this.consumerCount -= 1;
      };

      this.actions = Object.freeze(this.actions);
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

  class StateConsumer extends Component<IStateConsumerProps> {
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

  const provider = ((): any => (Wrapped: ComponentType): IWrapper => (
    props: any,
  ): JSX.Element => (
    <StateProvider>
      <Wrapped {...props} />
    </StateProvider>
  ))();

  const map = (mapFn = (s: any): any => s): any =>
    ((): HOC => (Wrapped: ComponentType): IWrapper => (
      props: any,
    ): JSX.Element => (
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

type IWrapper = (props: any) => JSX.Element;
type HOC = (Wrapped: any) => IWrapper;

export const inject = <T extends {}>() => ({} as T);
