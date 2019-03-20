/* tslint:disable max-classes-per-file */

import { createLogger } from '@phnq/log';
import React, { Component, createContext, PureComponent } from 'react';

type IValue = string | number | boolean | IData | undefined;

interface IData {
  [key: string]: IValue | IValue[];
}

interface IReturnsVoid {
  [key: string]: (...args: any[]) => void;
}

const log = createLogger('phnq-lib.state');
const names = new Set<string>();
// const providers = new Map<string, Component>();

declare global {
  interface Window {
    getCombinedState: () => any;
  }
}

type Class = new (...args: any[]) => any;

// if (!window.getCombinedState) {
//   window.getCombinedState = () =>
//     Object.keys(providers).reduce(
//       (states, k) => ({ ...states, [k]: (providers.get(k) || {}).state }),
//       {},
//     );
// }

interface IStateProviderProps {}

interface IStateConsumerProps {
  _incrementConsumerCount(): void;
  _decrementConsumerCount(): void;
}

export const createState = <TState, TActions>(
  name: string,
  defaultState: TState & IData,
  getActions: (
    getState: () => any,
    setState: (s: any) => void,
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
    private actions: any;

    constructor(props: IStateProviderProps) {
      super(props);
      // providers[name] = this;
      this.consumerCount = 0;
      this.state = defaultState as TState;
      this.actions = getActions(
        () => ({ ...this.state }),
        (state: any) => {
          log('%s(%d) - %o', name.toUpperCase(), this.consumerCount, state);
          this.setState(state);
        },
      ) as TActions;

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

  class StateConsumer extends PureComponent<IStateConsumerProps> {
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

  const provider = ((): any => (Wrapped: Class): any => (props: any): any => (
    <StateProvider>
      <Wrapped {...props} />
    </StateProvider>
  ))();

  const map = (mapFn = (s: any): any => s): any =>
    ((): any => (Wrapped: Class): any => (props: any): any => (
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
