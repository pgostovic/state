import { createLogger } from '@phnq/log';
import React, { ComponentType, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const log = createLogger('@phnq/state');

type State<S> = {
  [K in keyof S]: S[K] | ((state: Omit<S, K>) => S[K]);
} & { [key: string]: unknown };

interface ImplicitActions<A> {
  /**
   * This gets called when the state provider is mounted, or if the `ressetState(true)`
   * action is called from a consumer.
   */
  init?(): void;
  /**
   * This gets called when the state provider is unmounted.
   */
  destroy?(): void;
  /**
   * If specifified, errors thrown from actions will result in this function being
   * called.
   * @param error the error that was thrown in the action.
   * @param action the name of the action where the error was thrown.
   */
  onError?(error: unknown, action: keyof Actions<A>): void;
}

type Actions<A> = A & ImplicitActions<A>;

type ActionFunction = (...args: never[]) => void | Promise<void>;

type VoidActions<T> = Record<keyof T, ActionFunction>;

interface GetActionsParams<S, E> {
  /**
   * Returns a copy of the current state.
   * @returns a copy of the current state
   */
  getState(): S;
  /**
   * Returns a copy of the named external state.
   * @returns a copy of the named external state
   */
  getState(extStateName: keyof E): E[keyof E];
  /**
   * Used to set some someset of the full state.
   * @param subState a subset of the full state
   */
  setState(subState: Partial<S>): void;
  /**
   * Resets the full state to its initial value.
   * @param reinitialize whether or not the `init()` lifecycle method should be called.
   */
  resetState(reinitialize?: boolean): void;
}

interface ChangeListener<S> {
  id: number;
  onChange(changedKeys: (keyof S)[]): void;
}

interface StateBroker<S = unknown, A = unknown> {
  state: S;
  actions: Readonly<Actions<A>>;
  addListener(listener: ChangeListener<S>): void;
  removeListener(id: number): void;
}

export interface StateFactory<S = unknown, A = unknown> {
  /**
   * This HOC creates a state provider by wrapping a component. The returned component's
   * interface will be identical to the wrapped component's interface. Descendents of this
   * state provider in the component hierarchy will be able to interact with its state via
   * `useState()` hook or the (deprecated) `consumer` HOC.
   * @param Wrapped the component to be wrapped.
   */
  provider: <T extends {}>(Wrapped: ComponentType<T>) => ComponentType<T>;
  /**
   * This hook returns the complete state and actions of its nearest counterpart provider
   * ancestor in the component hierarchy. If no arguments are passed then the component
   * containing the `useState()` call will render whenever the state changes. However,
   * supplying state attribute keys as arguments will limit the rendering to occasions
   * when attributes for specified keys change.
   * @param keys list of state attribute keys to trigger renders. Empty means every state
   * change triggers a render.
   */
  useState(...keys: (keyof S)[]): S & Readonly<A>;
  /**
   * @deprecated
   * Wrapping a component with this HOC adds the ancestor provider's state attribute keys
   * to the wrapped component's props.
   * Note: this HOC is deprecated in favour of the more flexible and unobtrusive `useState()`.
   * @param Wrapped the component to be wrapped.
   */
  consumer<T = unknown>(Wrapped: ComponentType<T>): ComponentType<Omit<T, keyof (S & A)>>;
  /**
   * @deprecated
   * Similar to `comsumer`, this HOC also wraps a component to provide access to its ancestor
   * provider's state, but it additionally allows you to map the state to an aribitrary list
   * of props.
   * @param mapFn
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map<T = unknown>(mapFn: (s: State<S> & Actions<A>) => T): (Wrapped: ComponentType<any>) => ComponentType<any>;
}

/**
 * Only used internally for communicating bewtween states.
 */
interface InternalStateFactory<S> extends StateFactory<S> {
  useStateBroker(): StateBroker<S>;
}

type GetActions<S, A, P, E> = (getActionsParams: GetActionsParams<S, E> & P) => Actions<A>;
type MapProvider<P> = <T = unknown>(p: ComponentType<P>) => ComponentType<T & Omit<T, keyof P>>;

/**
 * Creates a factory for generating state providers, consumer hooks and HOCs. A single state
 * factory can generate multiple providers/consumers.
 * @param name The name of the state. Only used for logging.
 * @param defaultState The initial value of the state, and derived state functions.
 * @param getActions Function that returns the action functions.
 * @param mapProvider Optional function for adding behaviour to the provider in the form of a HOC.
 * @returns a state factory.
 */
export function createState<S, A extends VoidActions<A>, P = {}>(
  name: string,
  defaultState: State<S>,
  getActions: GetActions<S, A, P, {}>,
  mapProvider?: MapProvider<P>,
): StateFactory<S, A>;
/**
 * Creates a factory for generating state providers, consumer hooks and HOCs. A single state
 * factory can generate multiple providers/consumers.
 * @param name The name of the state. Only used for logging.
 * @param defaultState The initial value of the state, and derived state functions.
 * @param extStates Named external state factories.
 * @param getActions Function that returns the action functions.
 * @param mapProvider Optional function for adding behaviour to the provider in the form of a HOC.
 * @returns a state factory.
 */
export function createState<S, E, A extends VoidActions<A>, P = {}>(
  name: string,
  defaultState: State<S>,
  extStates: Record<keyof E, StateFactory<E[keyof E]>>,
  getActions: GetActions<S, A, P, E>,
  mapProvider?: MapProvider<P>,
): StateFactory<S, A>;
export function createState<S, A extends VoidActions<A>, P = {}, E = {}>(
  name: string,
  defaultState: State<S>,
  ...args: unknown[]
): StateFactory<S, A> {
  const extStates = typeof args[0] === 'object' ? (args[0] as Record<keyof E, StateFactory<E[keyof E]>>) : undefined;
  const getActions = (extStates ? args[1] : args[0]) as GetActions<S, A, P, E>;
  const mapProvider = (extStates ? args[2] : args[1]) as MapProvider<P> | undefined;
  const { stateDerivers, initialState } = processDefaultState(defaultState);

  const derivedProperties = stateDerivers.map(({ key }) => key);

  /**
   * State Provider
   */
  const provider = <T extends {}>(Wrapped: ComponentType<T>): ComponentType<T> => (props: T) => {
    const listenersRef = useRef<ChangeListener<S>[]>([]);

    const actions = useMemo(() => {
      function getState(): S;
      function getState(extStateName: keyof E): E[keyof E];
      function getState(extStateName?: keyof E) {
        if (extStateName) {
          return { ...brokers[extStateName].state };
        }
        return { ...stateBrokerRef.current.state };
      }

      const setState = (subState: Partial<S>) => {
        log('%s - %o', name.toUpperCase(), subState);

        const currentState = stateBrokerRef.current.state;

        if (subState !== initialState && Object.keys(subState).some(k => derivedProperties.includes(k))) {
          throw new Error(`Derived properties may not be set explicitly: ${derivedProperties.join(', ')}`);
        }

        const derivedState = stateDerivers.reduce(
          (d, { key, derive }) => ({ ...d, [key]: derive({ ...currentState, ...subState }) }),
          {} as Partial<S>,
        );

        const deltaState = { ...subState, ...derivedState };

        // Only affect a state change (and render) if needed. Strict equality on top-level values is the measure.
        const changedKeys = (Object.keys(deltaState) as (keyof Partial<S>)[]).filter(
          k => deltaState[k] !== currentState[k],
        );
        if (changedKeys.length > 0) {
          stateBrokerRef.current.state = { ...currentState, ...deltaState };

          listenersRef.current.forEach(({ onChange }) => onChange(changedKeys));
        }
      };

      const resetState = (reinitialize = true) => {
        setState(initialState);
        const { init } = actions;
        if (reinitialize && init) {
          init();
        }
      };

      const unboundActions = getActions({ ...(props as T & P), getState, setState, resetState });
      const onError = unboundActions.onError;

      const actionNames = [...Object.keys(unboundActions)] as (keyof Actions<A>)[];
      const boundActions: Partial<Actions<A>> = {};
      actionNames.forEach(k => {
        const action = unboundActions[k];
        boundActions[k] = (action as ActionFunction).bind(boundActions) as Partial<Actions<A>>[keyof Actions<A>];

        if (onError && k !== 'onError') {
          boundActions[k] = ((...args: never[]): Promise<void> =>
            new Promise(resolve => {
              try {
                const result = (action as ActionFunction).apply(boundActions, args);
                if (result instanceof Promise) {
                  result.then(resolve).catch(err => onError(err, k));
                } else {
                  resolve(result);
                }
              } catch (err) {
                onError(err, k);
              }
            })) as never;
        }
      });
      return Object.freeze(boundActions as Actions<A>);
    }, []);

    useEffect(() => {
      const { init, destroy } = actions;

      if (init) {
        init();
      }
      return destroy;
    }, []);

    const stateBrokerRef = useRef<StateBroker<S, A>>({
      state: initialState,

      actions,

      addListener(listener: ChangeListener<S>) {
        listenersRef.current = [...listenersRef.current, listener];
      },
      removeListener(theId: number) {
        listenersRef.current = listenersRef.current.filter(({ id }) => id !== theId);
      },
    });

    const brokers = {} as Record<keyof E, StateBroker<E[keyof E]>>;

    if (extStates) {
      let k: keyof E;
      for (k in extStates) {
        brokers[k] = (extStates[k] as InternalStateFactory<E[keyof E]>).useStateBroker();
      }
    }

    useEffect(() => {
      stateBrokers = [...stateBrokers, [name, stateBrokerRef.current]];
      log('Mounted provider: ', name);
      return () => {
        stateBrokers = stateBrokers.filter(([, stateBroker]) => stateBroker !== stateBrokerRef.current);
        log('Unmounted provider: ', name);
      };
    }, []);

    return (
      <Context.Provider value={stateBrokerRef.current}>
        <Wrapped {...props} />
      </Context.Provider>
    );
  };

  const Context = createContext<Partial<StateBroker<S, A>>>({
    state: initialState,
    addListener() {
      throw new Error('Default should not be invoked: addListener');
    },
    removeListener() {
      throw new Error('Default should not be invoked: removeListener');
    },
  });

  const useStateFn = (...keys: (keyof S)[]) => {
    const idRef = useRef(idIter.next().value);
    const { state, actions, addListener, removeListener } = useContext(Context);
    const [, render] = useState(false);

    useEffect(() => {
      if (addListener && removeListener) {
        addListener({
          id: idRef.current,
          onChange(changedKeys) {
            if (keys.length === 0 || keys.some(k => changedKeys.includes(k))) {
              render(r => !r);
            }
          },
        });
        return () => {
          removeListener(idRef.current);
        };
      } else {
        throw new Error('Should not happen!');
      }
    }, []);

    if (state && actions) {
      return { ...state, ...actions };
    } else {
      throw new Error('Should not happen!');
    }
  };

  const consumer = function<T = unknown>(Wrapped: ComponentType<T>) {
    return function(props: T & S & A) {
      const stateAndActions = useStateFn();
      return <Wrapped {...props} {...stateAndActions} />;
    } as ComponentType<Omit<T, keyof (S & A)>>;
  };

  function map<T = unknown>(mapFn: (s: State<S> & Actions<A>) => T) {
    return function(Wrapped: ComponentType): ComponentType<T> {
      return function(props: T) {
        const stateAndActions = useStateFn();
        return <Wrapped {...props} {...mapFn({ ...stateAndActions })} />;
      };
    };
  }

  return {
    consumer,
    provider: (mapProvider
      ? (Wrapped: ComponentType<P>) => mapProvider<typeof provider>(provider(props => <Wrapped {...props} />))
      : provider) as StateFactory<S, A>['provider'],
    map,
    useState: useStateFn,
    useStateBroker: () => useContext(Context),
  } as StateFactory<S, A>;
}

const idIter = (function* idGen(): IterableIterator<number> {
  let i = 0;
  while (true) {
    i += 1;
    yield i;
  }
})();

const processDefaultState = <S,>(defaultState: State<S>) => ({
  stateDerivers: Object.keys(defaultState).reduce(
    (derivers, key) =>
      typeof defaultState[key] === 'function'
        ? [...derivers, { key, derive: defaultState[key] as Function }]
        : derivers,
    [] as { key: string; derive: Function }[],
  ),
  initialState: Object.keys(defaultState).reduce(
    (s, key) =>
      typeof defaultState[key] === 'function'
        ? { ...s, [key]: (defaultState[key] as Function)(defaultState) }
        : { ...s, [key]: defaultState[key] },
    {} as Partial<S>,
  ) as S,
});

declare global {
  interface Window {
    getAllStates: () => [string, unknown][];
    logAllStates: () => void;
  }
}

let stateBrokers: Array<[string, StateBroker<unknown, unknown>]> = [];

if (!window.getAllStates) {
  window.getAllStates = () => stateBrokers.map(([name, stateBroker]) => [name, stateBroker.state]);
}

if (!window.logAllStates) {
  window.logAllStates = () => {
    stateBrokers.forEach(([name, stateBroker]) => {
      console.groupCollapsed(
        `${name} %c${Object.keys(stateBroker.state as object).join()}`,
        'font-weight: normal; color: #666',
      );
      console.log(stateBroker.state);
      console.groupEnd();
    });
  };
}
