import React, { ComponentType, createContext, ReactElement, useContext } from 'react';

import StateProvider, { StateProviderType } from './StateProvider';

export type State<S> = {
  [K in keyof S]: S[K] | ((state: Omit<S, K>) => S[K]);
} & { [key: string]: unknown };

export interface ImplicitActions<A> {
  init?(): void;
  destroy?(): void;
  onError?(error: unknown, action: keyof Actions<A>): void;
}

export type Actions<A> = A & ImplicitActions<A>;

export type ActionFunction = (...args: never[]) => void | Promise<void>;

type VoidActions<T> = Record<keyof T, ActionFunction>;

export interface GetActionsParams<S> {
  getState(): S;
  setState(subState: Partial<S>): Promise<void>;
  resetState(): Promise<void>;
}

declare global {
  interface Window {
    getCombinedState: () => { [key: string]: unknown };
  }
}

const combinedState: { [key: string]: unknown } = {};

if (!window.getCombinedState) {
  window.getCombinedState = () => combinedState;
}

export const createState = <S, A extends VoidActions<A>, P = {}>(
  name: string,
  defaultState: State<S>,
  getActions: (getActionsParams: GetActionsParams<S> & P) => Actions<A>,
  mapProvider?: (p: ComponentType<P>) => ComponentType,
) => {
  const context = createContext<Partial<State<S> & Actions<A>>>({});

  let state: S & A;

  const MappedProvider = (mapProvider
    ? mapProvider(StateProvider as () => ReactElement)
    : StateProvider) as StateProviderType<S, A, P>;

  const provider = <T extends {}>(Wrapped: ComponentType<T>): ComponentType<T> => (props: T) => (
    <MappedProvider
      name={name}
      context={context}
      defaultState={defaultState}
      getActions={getActions}
      onChange={s => {
        state = s;
        combinedState[name] = state;
      }}
    >
      <Wrapped {...props} />
    </MappedProvider>
  );

  const { Consumer } = context;

  function map(mapFn = (s: Partial<State<S> & Actions<A>>): unknown => s) {
    return function<P = unknown>(Wrapped: ComponentType<P>): ComponentType<P> {
      return function(props: P) {
        return <Consumer>{state => <Wrapped {...props} {...mapFn(state)} />}</Consumer>;
      };
    };
  }

  return { provider, consumer: map(), map, getState: () => state, useState: () => useContext(context) as S & A };
};
