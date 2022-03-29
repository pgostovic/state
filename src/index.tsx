import { createLogger } from '@phnq/log';
import React, { ComponentType, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const log = createLogger('@phnq/state');

let allowProxyUsage = true;
export const setAllowProxyUsage = (allow: boolean) => {
  allowProxyUsage = allow;
};

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
  found: boolean;
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
   * ancestor in the component hierarchy. Referencing an attribute in the returned state
   * implicitly subscribes the current render context to be notified when that attribute's
   * value changes. The "notification" is a render. For example, consider:
   * ```ts
   *   const { firstName } = userState.useState();
   * ```
   * A render will be triggered if `firstName` changes in the state. However, suppose there
   * is also a value in the state for the attribute `lastName`; no render will occur as a
   * result of `lastName` changing.
   */
  useState(): S & Readonly<A>;
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
export function createState<S extends object, A extends VoidActions<A>, P = {}>(
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
export function createState<S extends object, E, A extends VoidActions<A>, P = {}>(
  name: string,
  defaultState: State<S>,
  extStates: Record<keyof E, StateFactory<E[keyof E]>>,
  getActions: GetActions<S, A, P, E>,
  mapProvider?: MapProvider<P>,
): StateFactory<S, A>;
export function createState<S extends object, A extends VoidActions<A>, P = {}, E = {}>(
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

    /**
     * Set up the actions for the current provider. Most of the behaviour is in the actions, especially
     * in `setState()`.
     */
    const actions = useMemo(() => {
      function getState(): S;
      function getState(extStateName: keyof E): E[keyof E];
      function getState(extStateName?: keyof E) {
        if (extStateName) {
          return { ...extStateBrokers[extStateName].state, ...extStateBrokers[extStateName].actions };
        }
        return { ...stateBrokerRef.current.state };
      }

      const setState = (stateChanges: Partial<S>) => {
        log('%s - %o', name.toUpperCase(), stateChanges);

        const currentState = stateBrokerRef.current.state;

        if (stateChanges !== initialState && Object.keys(stateChanges).some(k => derivedProperties.includes(k))) {
          throw new Error(`Derived properties may not be set explicitly: ${derivedProperties.join(', ')}`);
        }

        // Calculate the derived state from current state plus the incoming changes.
        const derivedState = stateDerivers.reduce(
          (d, { key, derive }) => ({ ...d, [key]: derive({ ...currentState, ...stateChanges }) }),
          {} as Partial<S>,
        );

        // The effective state change is the incoming changes plus the some subset of the derived state.
        const deltaState = { ...stateChanges, ...derivedState };

        // Only notify of a state change if needed. Strict equality on top-level values is the measure.
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

      /**
       * Bind the action functions to the enclosing object so other sibling actions may
       * be called by using `this`. For example:
       *
       *   someAction() {
       *     doSomething();
       *   },
       *
       *   someOtherAction() {
       *     this.someAction();
       *     doSomeOtherThing();
       *   }
       */
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

    // Call init() on mount, destroy() on unmount.
    useEffect(() => {
      const { init, destroy } = actions;
      if (init) {
        init();
      }
      return destroy;
    }, []);

    // Set up the StateBroker for the current provider.
    const stateBrokerRef = useRef<StateBroker<S, A>>({
      found: true,
      state: initialState,
      actions,
      addListener(listener: ChangeListener<S>) {
        listenersRef.current = [...listenersRef.current, listener];
      },
      removeListener(theId: number) {
        listenersRef.current = listenersRef.current.filter(({ id }) => id !== theId);
      },
    });

    // Obtain references to external StateBroker instances.
    const extStateBrokers = {} as Record<keyof E, StateBroker<E[keyof E]>>;
    if (extStates) {
      let k: keyof E;
      for (k in extStates) {
        extStateBrokers[k] = (extStates[k] as InternalStateFactory<E[keyof E]>).useStateBroker();
      }
    }

    // Add/remove current StateBroker on mount/unmount.
    useEffect(() => {
      allStateBrokers = [...allStateBrokers, [name, stateBrokerRef.current]];
      log('Mounted provider: ', name);
      return () => {
        allStateBrokers = allStateBrokers.filter(([, stateBroker]) => stateBroker !== stateBrokerRef.current);
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
    found: false,
    state: initialState,
  });

  const useStateFn = (forceNoProxy = false) => {
    const idRef = useRef(idIter.next().value);
    const { found, state, actions, addListener, removeListener } = useContext(Context);
    const [, render] = useState(false);

    if (!found) {
      throw new Error(
        `No provider found for state '${name}'. The current component must be a descendent of a '${name}' state provider.`,
      );
    }

    const refKeys = new Set<keyof S | keyof A>();

    useEffect(() => {
      if (addListener && removeListener) {
        addListener({
          id: idRef.current,
          onChange(changedKeys) {
            if (changedKeys.some(k => refKeys.has(k))) {
              render(r => !r);
            }
          },
        });
        return () => {
          removeListener(idRef.current);
        };
      }
    }, []);

    if (state && actions) {
      const stateCopy = { ...state, ...actions };
      /**
       * Only return a Proxy if the browser supports it. Otherwise just return
       * the whole state. Proxy is required for implicit substate change subscription.
       */
      if (!forceNoProxy && allowProxyUsage && typeof Proxy === 'function') {
        const stateProxy = new Proxy(stateCopy, {
          get(target, prop) {
            refKeys.add(prop as keyof S | keyof A);
            return target[prop as keyof S | keyof A];
          },
        });
        return stateProxy;
      } else {
        Object.keys(stateCopy).forEach(k => refKeys.add(k as keyof S | keyof A));
        return stateCopy;
      }
    } else {
      throw new Error(
        'Something strange happened! The StateBroker was found, but one or both of `state` and `actions` was not set.',
      );
    }
  };

  const consumer = function<T = unknown>(Wrapped: ComponentType<T>) {
    return function(props: T & S & A) {
      const stateAndActions = useStateFn(true);
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
    useStateBroker: () => {
      const stateBroker = useContext(Context);
      if (!stateBroker.found) {
        throw new Error(
          `No provider found for state '${name}'. The current component must be a descendent of a '${name}' state provider.`,
        );
      }
      return stateBroker;
    },
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

let allStateBrokers: Array<[string, StateBroker<unknown, unknown>]> = [];

if (!window.getAllStates) {
  window.getAllStates = () => allStateBrokers.map(([name, stateBroker]) => [name, stateBroker.state]);
}

if (!window.logAllStates) {
  window.logAllStates = () => {
    allStateBrokers.forEach(([name, stateBroker]) => {
      console.groupCollapsed(
        `${name} %c${Object.keys(stateBroker.state as object).join()}`,
        'font-weight: normal; color: #666',
      );
      console.log(stateBroker.state);
      console.groupEnd();
    });
  };
}
