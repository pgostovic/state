import { createLogger } from '@phnq/log';
import React, { ComponentType, createContext, ReactElement, useContext, useEffect } from 'react';

import StateProvider, { StateProviderType } from './StateProvider';

const log = createLogger('@phnq/state');

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
  resetState(reinitialize?: boolean): Promise<void>;
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
  const context = createContext<(State<S> & Actions<A>) | undefined>(undefined);

  let state: S & A;

  const MappedProvider = (mapProvider
    ? mapProvider(StateProvider as () => ReactElement)
    : StateProvider) as StateProviderType<S, A, P>;

  const provider = <T extends {}>(Wrapped: ComponentType<T>): ComponentType<T> => (props: T) => {
    useEffect(() => {
      if (combinedState[name]) {
        throw new Error(`Duplicate state name: ${name}`);
      }
      combinedState[name] = state;
      log('Mounted provider: ', name);
      return () => {
        delete combinedState[name];
        log('Unmounted provider: ', name);
      };
    }, []);

    return (
      <MappedProvider
        name={name}
        context={context}
        defaultState={defaultState}
        getActions={getActions}
        onChange={s => {
          state = s;
        }}
      >
        <Wrapped {...props} />
      </MappedProvider>
    );
  };

  const { Consumer } = context;

  function map<M = unknown>(mapFn: (s: State<S> & Actions<A>) => M) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function(Wrapped: ComponentType<any>): ComponentType<any> {
      return function(props: M) {
        return <Consumer>{state => <Wrapped {...props} {...(state ? mapFn(state) : {})} />}</Consumer>;
      };
    };
  }

  const consumer = function<P = unknown>(Wrapped: ComponentType<P>) {
    return function(props: P & S & A) {
      return <Consumer>{state => <Wrapped {...props} {...state} />}</Consumer>;
    } as ComponentType<Omit<P, keyof (S & A)>>;
  };

  return { provider, consumer, map, getState: () => state, useState: () => useContext(context) as S & A };
};
