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

interface ImplicitActions<S, A> {
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
  onError?(error: unknown, action: keyof Actions<S, A>): void;

  /**
   * This gets called after state changes have been made.
   */
  onChange?(changedKeys: (keyof S)[], prevState: S): void;
}

type Actions<S, A> = A & ImplicitActions<S, A>;

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
  setState<T>(subState: SubState<S, T>): void;
  /**
   * Resets the full state to its initial value.
   * @param reinitialize whether or not the `init()` lifecycle method should be called.
   */
  resetState(reinitialize?: boolean): void;
}

interface ChangeListener<S> {
  id: number;
  onChangeInternal(changedKeys: (keyof S)[]): void;
}

interface StateBroker<S = unknown, A = unknown> {
  found: boolean;
  state: S;
  actions: Readonly<Actions<S, A>>;
  addListener(listener: ChangeListener<S>): void;
  removeListener(id: number): void;
}

export interface StateFactory<S = unknown, A = unknown, PR extends keyof S = never> {
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
  useState(): Omit<S, PR> & Readonly<A>;
  /**
   * @deprecated
   * Wrapping a component with this HOC adds the ancestor provider's state attribute keys
   * to the wrapped component's props.
   * Note: this HOC is deprecated in favour of the more flexible and unobtrusive `useState()`.
   * @param Wrapped the component to be wrapped.
   */
  consumer<T = unknown>(Wrapped: ComponentType<T>): ComponentType<Omit<T, keyof (Omit<S, PR> & A)>>;
  /**
   * @deprecated
   * Similar to `comsumer`, this HOC also wraps a component to provide access to its ancestor
   * provider's state, but it additionally allows you to map the state to an aribitrary list
   * of props.
   * @param mapFn
   */
  map<T = unknown>(
    mapFn: (s: State<Omit<S, PR>> & Actions<Omit<S, PR>, A>) => T,
  ): // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Wrapped: ComponentType<any>) => ComponentType<any>;
}

/**
 * Only used internally for communicating bewtween states.
 */
interface InternalStateFactory<S> extends StateFactory<S> {
  useStateBroker(): StateBroker<S>;
}

type GetActions<S, A, P, E> = (getActionsParams: GetActionsParams<S, E> & P) => Actions<S, A>;
type MapProvider<P> = <T = unknown>(p: ComponentType<P>) => ComponentType<T & Omit<T, keyof P>>;
type SubState<S, U> = Partial<S> & { [K in keyof U]-?: K extends keyof S ? S[K] : never };

/**
 * Creates a factory for generating state providers, consumer hooks and HOCs. A single state
 * factory can generate multiple providers/consumers.
 * @param name The name of the state. Only used for logging.
 * @param defaultState The initial value of the state, and derived state functions.
 * @param getActions Function that returns the action functions.
 * @param mapProvider Optional function for adding behaviour to the provider in the form of a HOC.
 * @returns a state factory.
 */
export function createState<S extends object, A extends VoidActions<A>, P = {}, PR extends keyof S = never>(
  name: string,
  defaultState: State<S>,
  getActions: GetActions<S, A, P, {}>,
  mapProvider?: MapProvider<P>,
): StateFactory<S, A, PR>;
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
export function createState<S extends object, E, A extends VoidActions<A>, P = {}, PR extends keyof S = never>(
  name: string,
  defaultState: State<S>,
  extStates: Record<keyof E, StateFactory<E[keyof E]>>,
  getActions: GetActions<S, A, P, E>,
  mapProvider?: MapProvider<P>,
): StateFactory<S, A, PR>;
export function createState<S extends object, A extends VoidActions<A>, P = {}, E = {}, PR extends keyof S = never>(
  name: string,
  defaultState: State<S>,
  ...args: unknown[]
): StateFactory<S, A, PR> {
  const extStates = typeof args[0] === 'object' ? (args[0] as Record<keyof E, StateFactory<E[keyof E]>>) : undefined;
  const getActions = (extStates ? args[1] : args[0]) as GetActions<S, A, P, E>;
  const mapProvider = (extStates ? args[2] : args[1]) as MapProvider<P> | undefined;
  const { stateDerivers, initialState } = processDefaultState(defaultState);

  const derivedProperties = stateDerivers.map(({ key }) => key);

  const MAX_CONCURRENT_ON_CHANGE_COUNT = 5;

  /**
   * State Provider
   */
  const provider = <T extends {}>(Wrapped: ComponentType<T>): ComponentType<T> => (props: T) => {
    const listenersRef = useRef<ChangeListener<S>[]>([]);
    const onChangeCount = useRef(0);
    const numSetStateCalls = useRef(0);

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

      //TODO: Should be able to batch these calls. Accumulate state changes and then commit the actual
      // state change at the end of the event loop.

      function setState<T>(stateChanges: SubState<S, T>, incremental = true) {
        if (onChangeCount.current > MAX_CONCURRENT_ON_CHANGE_COUNT) {
          throw new Error(
            'Too many setState() calls from onChange(). Make sure to wrap setState() calls in a condition when called from onChange().',
          );
        }

        numSetStateCalls.current += 1;

        const currentState = incremental ? stateBrokerRef.current.state : ({} as S);

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
          const colorCat = colorize(name);
          log(
            `${colorCat.text} %cSTATE Δ%c - %o`,
            ...colorCat.args,
            'font-weight:bold',
            'font-weight:normal',
            Object.entries(deltaState)
              .filter(([k]) => changedKeys.includes(k as keyof S))
              .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {}),
          );

          const prevState = stateBrokerRef.current.state;
          stateBrokerRef.current.state = { ...currentState, ...deltaState };
          listenersRef.current.forEach(({ onChangeInternal }) => onChangeInternal(changedKeys));

          const { onChange } = actions;
          if (onChange) {
            try {
              onChangeCount.current += 1;
              onChange(changedKeys, prevState);
            } finally {
              onChangeCount.current -= 1;
            }
          }
        }
      }

      const resetState = (reinitialize = true) => {
        setState(initialState, false);
        const { init } = actions;
        if (reinitialize && init) {
          init();
        }
      };

      const implicitActionNames = ['destroy', 'init', 'onChange', 'onError'] as (keyof Actions<S, A>)[];

      const calculateDerivedStateIfNeeded = (actionName: keyof Actions<S, A>, numSetStateCallsBefore: number) => {
        if (numSetStateCalls.current === numSetStateCallsBefore && !implicitActionNames.includes(actionName)) {
          setState({});
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
      const { onError = () => undefined } = unboundActions;
      const actionNames = [...Object.keys(unboundActions)] as (keyof Actions<S, A>)[];
      const boundActions: Partial<Actions<S, A>> = {};
      actionNames.forEach(k => {
        const action = unboundActions[k];

        boundActions[k] = ((...args: never[]): Promise<void> =>
          new Promise(resolve => {
            const colorCat = colorize(name);
            log(
              `${colorCat.text} %cACTION%c - %s`,
              ...colorCat.args,
              'font-weight:bold',
              'font-weight:normal',
              k,
              ...args,
            );
            setTimeout(async () => {
              try {
                const numSetStateCallsBefore = numSetStateCalls.current;
                const result = (action as ActionFunction).apply(boundActions, args);
                if (result instanceof Promise) {
                  await result;
                }
                resolve();
                calculateDerivedStateIfNeeded(k, numSetStateCallsBefore);
              } catch (err) {
                if (k === 'onError') {
                  throw err;
                } else {
                  onError(err, k);
                }
              }
            }, 0);
          })) as never;
      });
      return Object.freeze(boundActions as Actions<S, A>);
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

  const useStateFn = (alwaysRenderOnChange = false) => {
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
          onChangeInternal(changedKeys) {
            if (alwaysRenderOnChange || changedKeys.some(k => refKeys.has(k))) {
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
      const stateCopy = { ...(state as Omit<S, PR>), ...actions };
      /**
       * Only return a Proxy if the browser supports it. Otherwise just return
       * the whole state. Proxy is required for implicit substate change subscription.
       */
      if (allowProxyUsage && typeof Proxy === 'function') {
        const stateProxy = new Proxy(stateCopy, {
          get(target, prop) {
            refKeys.add(prop as keyof Omit<S, PR> | keyof A);
            return target[prop as keyof Omit<S, PR> | keyof A];
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

  function map<T = unknown>(mapFn: (s: State<Omit<S, PR>> & Actions<Omit<S, PR>, A>) => T) {
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
  } as StateFactory<S, A, PR>;
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

const colorize = (s: string): { args: string[]; text: string } => {
  const charCodeSum = s
    .split('')
    .map((char: string) => char.charCodeAt(0))
    .reduce((sum: number, charCode: number) => sum + charCode, 0);

  const hue = charCodeSum % 360;

  return {
    args: [`font-weight: bold; color: hsl(${hue}, 100%, 30%)`, 'font-weight: normal; color: inherit'],
    text: `%c${s}%c`,
  };
};
