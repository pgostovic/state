import React, { ComponentType, createContext, useContext } from 'react';

import StateProvider from './StateProvider';

export type State<S> = {
  [K in keyof S]: S[K] | ((state: Omit<S, K>) => S[K]);
} & { [key: string]: unknown };

export interface ImplicitActions<A> {
  init?(): void;
  destroy?(): void;
  onError?(error: unknown, action: keyof Actions<A>): void;
}

export type Actions<A> = A & ImplicitActions<A>;

type ActionFunction = (...args: never[]) => void | Promise<void>;

type VoidActions<T> = Record<keyof T, ActionFunction>;

export interface GetActionsParams<S> {
  getState(): S;
  setState(subState: Partial<S>): Promise<void>;
  resetState(): Promise<void>;
}

export const createState = <S, A extends VoidActions<A>>(
  name: string,
  defaultState: State<S>,
  getActions: (getActionsParams: GetActionsParams<S>) => Actions<A>,
) => {
  const context = createContext<Partial<State<S> & Actions<A>>>({});

  let state: S & A;

  const provider = (Wrapped: ComponentType) => <T extends {}>(props: T) => (
    <StateProvider<S, A>
      name={name}
      context={context}
      defaultState={defaultState}
      getActions={getActions}
      onChange={s => (state = s)}
    >
      <Wrapped {...props} />
    </StateProvider>
  );

  return { provider, getState: () => state, useState: () => useContext(context) as S & A };
};
