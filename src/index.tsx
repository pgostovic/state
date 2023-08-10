import { createLogger } from '@phnq/log';
import deepEqual from 'fast-deep-equal';
import React, {
  ComponentType,
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const log = createLogger('@phnq/state');

let allowProxyUsage = true;
export const setAllowProxyUsage = (allow: boolean) => {
  allowProxyUsage = allow;
};

let invokationContext: { name: string; action: string | symbol | number } | undefined = undefined;

const lastRenderDurations = new Map<number, number>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenericObject = Record<string, any>;
type GenericFunction = (...args: unknown[]) => unknown;

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
   * @param changedKeys the state keys whose values changed.
   * @param changeInfo information about the change.
   */
  onChange?(changedKeys: (keyof S)[], changeInfo: StateChangeInfo<S>): void;
}

interface StateChangeInfo<S> {
  /**
   * The previous state -- i.e. before the state changes.
   */
  prevState: S;
  /**
   * Identifier of the change initiator. This is typically undefined which indicates an internal state change.
   */
  source?: string;
  /**
   * Whether the state change was triggered externally.
   */
  viaExternal: boolean;
}

type Actions<S, A> = A & ImplicitActions<S, A>;

type ActionFunction = (...args: never[]) => void | Promise<void>;

export type VoidActions<T> = Record<keyof T, ActionFunction>;

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
  order: number;
  onChangeInternal(info: {
    changedKeys: (keyof S)[];
    stateChanges: Partial<S>;
    newState: StateBroker<S>['state'];
    version: number;
  }): void;
}

interface StateBroker<S = unknown, A = unknown> {
  found: boolean;
  version: number; // incremented each time state changes
  state: S;
  setState(stateChanges: SubState<S, A>, options?: SetStateOptions): void;
  actions: Readonly<Actions<S, A>>;
  addListener(listener: ChangeListener<S>): void;
  removeListener(id: number): void;
}

interface SetStateOptions {
  incremental?: boolean;
  source?: string;
}

export interface StateFactory<S = unknown, A = unknown, PR extends keyof S = never> {
  /**
   * This HOC creates a state provider by wrapping a component. The returned component's
   * interface will be identical to the wrapped component's interface. Descendents of this
   * state provider in the component hierarchy will be able to interact with its state via
   * `useState()` hook or the (deprecated) `consumer` HOC.
   * @param Wrapped the component to be wrapped.
   */
  provider: <T extends GenericObject>(Wrapped: ComponentType<T>) => ComponentType<T>;
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
   * This hook provides a low-level way of interacting with the state. State changes are conveyed
   * via the supplied `onStateChange` callback. The return value is a function that can be used
   * to affect state changes directly, bypassing the action functions. This direct access to the
   * state breaks the typical encapsulation conventions/protections afforded by action functions,
   * so use of this hook is discouraged in all but the most exceptional of circumstances. As the
   * name implies, this hook is intended to be used for generic synchronization tasks.
   * @param onStateChange a callback that will be called whenever the state changes.
   * @returns a function that can be used to affect state changes directly.
   */
  useSync(onStateChange: (info: { state: S; changes: Partial<S> }) => void): StateBroker<S, A>['setState'];
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

interface Options<S, E = unknown, P = unknown> {
  /**
   * Named imported state factories.
   */
  imported?: Record<keyof E, StateFactory>;
  /**
   * function for adding behaviour to the provider in the form of a HOC.
   */
  mapProvider?: MapProvider<P>;

  deepCompare?: (keyof S)[];
}

export type GetActions<S, A, P extends GenericObject = GenericObject, E extends GenericObject = GenericObject> = (
  getActionsParams: GetActionsParams<S, E> & P,
) => Actions<S, A>;
type MapProvider<P> = <T = unknown>(p: ComponentType<P>) => ComponentType<T & Omit<T, keyof P>>;
type SubState<S, U> = Partial<S> & { [K in keyof U]-?: K extends keyof S ? S[K] : never };

/**
 * Creates a factory for generating state providers, consumer hooks and HOCs. A single state
 * factory can generate multiple providers/consumers.
 * @param name The name of the state. Only used for logging.
 * @param defaultState The initial value of the state, and derived state functions.
 * @param getActions Function that returns the action functions.
 * @returns a state factory.
 */
export function createState<S extends object, A extends VoidActions<A>, PR extends keyof S = never>(
  name: string,
  defaultState: State<S>,
  getActions: GetActions<S, A, GenericObject, GenericObject>,
): StateFactory<S, A, PR>;

/**
 * Creates a factory for generating state providers, consumer hooks and HOCs. A single state
 * factory can generate multiple providers/consumers.
 * @param name The name of the state. Only used for logging.
 * @param defaultState The initial value of the state, and derived state functions.
 * @param options Options for the state.
 * @param getActions Function that returns the action functions.
 * @returns a state factory.
 */
export function createState<
  S extends object,
  A extends VoidActions<A>,
  P extends GenericObject = GenericObject,
  E extends GenericObject = GenericObject,
  PR extends keyof S = never,
>(
  name: string,
  options: Options<S, E, P>,
  defaultState: State<S>,
  getActions: GetActions<S, A, P, E>,
): StateFactory<S, A, PR>;

export function createState<
  S extends object,
  A extends VoidActions<A>,
  P extends GenericObject = GenericObject,
  E extends GenericObject = GenericObject,
  PR extends keyof S = never,
>(name: string, ...args: unknown[]): StateFactory<S, A, PR> {
  const [options, defaultState, getActions] = (args.length === 2 ? [{}, ...args] : args) as [
    Options<S, E, P>,
    State<S>,
    GetActions<S, A, P, E>,
  ];

  const { imported: importedStates, mapProvider, deepCompare = [] } = options;

  const { stateDerivers, initialState } = processDefaultState(defaultState);

  const derivedProperties = stateDerivers.map(({ key }) => key);

  const MAX_CONCURRENT_ON_CHANGE_COUNT = 5;

  /**
   * State Provider
   */
  const provider =
    <T extends GenericObject>(Wrapped: ComponentType<T>): ComponentType<T> =>
    (props: T) => {
      const listenersRef = useRef<ChangeListener<S>[]>([]);
      const onChangeCount = useRef(0);
      const numSetStateCalls = useRef(0);
      const isInitializedRef = useRef(false);
      const accumulatedDeltaStateRef = useRef<Partial<S>>();
      const accumulatedDeltaStateChangesRef = useRef(0);
      const markedCurrentStateRef = useRef<S>();

      function getState(): S;
      function getState(extStateName: keyof E): E[keyof E];
      function getState(extStateName?: keyof E): S | E[keyof E] {
        if (extStateName) {
          return { ...extStateBrokers[extStateName].state, ...extStateBrokers[extStateName].actions };
        }
        return { ...stateBrokerRef.current.state };
      }

      const resetState = (reinitialize = true) => {
        setState(initialState, { incremental: false });
        const { init } = actions;
        if (reinitialize && init) {
          init();
        }
      };

      // const setState: StateBroker<S, A>['setState'] = (stateChanges, incremental) => {
      const setState = <T,>(stateChanges: SubState<S, T>, options: SetStateOptions = {}) => {
        const { incremental = true, source } = options;

        // function setState<T>(stateChanges: SubState<S, T>, incremental = true) {
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

        accumulatedDeltaStateChangesRef.current += 1;

        // Affect the internal state change immediately.
        const prevState = stateBrokerRef.current.state;
        stateBrokerRef.current.state = { ...currentState, ...deltaState };

        if (Object.keys(deltaState).some(k => deltaState[k as keyof S] !== prevState[k as keyof S])) {
          stateBrokerRef.current.version += 1;
        }

        const { onChange } = actions;
        if (onChange && isInitializedRef.current) {
          try {
            onChangeCount.current += 1;
            const changedKeys = (Object.keys(deltaState) as (keyof Partial<S>)[]).filter(k =>
              deepCompare.includes(k) ? !deepEqual(deltaState[k], currentState[k]) : deltaState[k] !== currentState[k],
            );
            onChange(changedKeys, { prevState, source, viaExternal: !!source });
          } finally {
            onChangeCount.current -= 1;
          }
        }

        /**
         * Accumulate the state changes. Listeners will be notified at the end of the event loop.
         * This is to avoid multiple renders when multiple state changes are made in quick succession.
         */
        if (accumulatedDeltaStateRef.current) {
          accumulatedDeltaStateRef.current = { ...accumulatedDeltaStateRef.current, ...deltaState };
        } else {
          accumulatedDeltaStateRef.current = deltaState;
        }

        markedCurrentStateRef.current = markedCurrentStateRef.current || currentState;

        if (accumulatedDeltaStateRef.current && markedCurrentStateRef.current) {
          const deltaStateCum = accumulatedDeltaStateRef.current;
          const markedCurrentState = markedCurrentStateRef.current;

          const stateChanges = Object.entries(deltaStateCum)
            .filter(([k]) => {
              const key = k as keyof Partial<S>;
              return deltaStateCum[key] !== markedCurrentState[key];
            })
            .reduce((s, [k, v]) => ({ ...s, [k]: v }), {} as Partial<S>);

          const changedKeys = Object.keys(stateChanges) as (keyof Partial<S>)[];

          if (changedKeys.length > 0) {
            const colorCat = colorize(name);
            const numChanges = accumulatedDeltaStateChangesRef.current;
            log(
              `${colorCat.text} %cSTATE Δ${numChanges > 1 ? [' (', numChanges, ') '].join('') : ''}%c - %o`,
              ...colorCat.args,
              'font-weight:bold',
              'font-weight:normal',
              Object.entries(deltaStateCum)
                .filter(([k]) => changedKeys.includes(k as keyof S))
                .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {}),
            );

            /**
             * Sort the listeners before notifying them. The order is:
             * 1. by listener order attribute
             * 2. by previous render duration, faster ones first
             * 3. by listener id descending -- i.e. newer listeners first
             *
             * This prevents slower listeners from blocking faster ones. Also, for
             * yet-to-be-rendered listeners (i.e. default prev render duration of 0),
             * newer ones are rendered first.
             */
            [...listenersRef.current]
              .sort((l1, l2) => {
                const dur1 = lastRenderDurations.get(l1.id) || 0;
                const dur2 = lastRenderDurations.get(l2.id) || 0;
                return l1.order - l2.order || dur1 - dur2 || l2.id - l1.id;
              })
              .forEach(({ onChangeInternal }) => {
                setTimeout(() => {
                  onChangeInternal({
                    changedKeys,
                    stateChanges,
                    newState: stateBrokerRef.current.state,
                    version: stateBrokerRef.current.version,
                  });
                }, 0);
              });
          }

          markedCurrentStateRef.current = undefined;
          accumulatedDeltaStateRef.current = undefined;
          accumulatedDeltaStateChangesRef.current = 0;
        }
      };
      /**
       * Set up the actions for the current provider. Most of the behaviour is in the actions, especially
       * in `setState()`.
       */
      const actions = useMemo(() => {
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
                `${String(k)}${invokationContext ? ` (via ${name}.${String(invokationContext.action)})` : ''}`,
                ...args,
              );

              const invokeAction = async () => {
                invokationContext = { name, action: k };
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
                } finally {
                  invokationContext = undefined;
                }
              };

              if (implicitActionNames.includes(k) || invokationContext) {
                invokeAction();
              } else {
                setTimeout(invokeAction, 0);
              }
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
        isInitializedRef.current = true;
        return () => {
          isInitializedRef.current = false;
          if (destroy) {
            destroy();
          }
        };
      }, []);

      // Set up the StateBroker for the current provider.
      const stateBrokerRef = useRef<StateBroker<S, A>>({
        found: true,
        version: 0,
        state: initialState,
        setState,
        actions,
        addListener(listener: ChangeListener<S>) {
          listenersRef.current = [...listenersRef.current, listener].sort((l1, l2) => l1.order - l2.order);
        },
        removeListener(theId: number) {
          listenersRef.current = listenersRef.current.filter(({ id }) => id !== theId);
        },
      });

      // Obtain references to external StateBroker instances.
      const extStateBrokers = {} as Record<keyof E, StateBroker<E[keyof E]>>;
      if (importedStates) {
        let k: keyof E;
        for (k in importedStates) {
          extStateBrokers[k] = (importedStates[k] as InternalStateFactory<E[keyof E]>).useStateBroker();
        }
      }

      // Add/remove current StateBroker on mount/unmount.
      useEffect(() => {
        allStateBrokers = [...allStateBrokers, [name, stateBrokerRef.current as StateBroker]];
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

  const Context = createContext<StateBroker<S, A>>({
    found: false,
    version: 0,
    state: initialState,
    setState: () => undefined,
    actions: {} as Actions<S, A>,
    addListener: () => undefined,
    removeListener: () => undefined,
  });

  const useSync: StateFactory<S, A>['useSync'] = onStateChange => {
    const idRef = useRef(idIter.next().value);
    const { found, addListener, removeListener, setState } = useContext(Context);

    if (!found) {
      throw new Error(
        `No provider found for state '${name}'. The current component must be a descendent of a '${name}' state provider.`,
      );
    }

    useEffect(() => {
      addListener({
        id: idRef.current,
        order: 10,
        onChangeInternal({ stateChanges, newState }) {
          onStateChange({ changes: stateChanges, state: newState });
        },
      });
      return () => {
        removeListener(idRef.current);
      };
    });

    return (s, options) => setState(s, { ...options, source: options?.source || 'external' });
  };

  const useStateFn = (alwaysRenderOnChange = false) => {
    const idRef = useRef(idIter.next().value);

    const { found, version, state, actions, addListener, removeListener } = useContext(Context);
    const [, render] = useState(false);

    if (!found) {
      throw new Error(
        `No provider found for state '${name}'. The current component must be a descendent of a '${name}' state provider.`,
      );
    }

    const referencedKeys = new Set<keyof S | keyof A>();

    useEffect(() => {
      lastRenderDurations.set(idRef.current, 0);
      return () => {
        lastRenderDurations.delete(idRef.current);
      };
    }, []);

    useEffect(() => {
      addListener({
        id: idRef.current,
        order: 0,
        onChangeInternal({ changedKeys, version: newVersion }) {
          /**
           * A state change will cause a re-render if:
           * 1. The `alwaysRenderOnChange` flag is set to true.
           * 2. A state key referenced by the enclosing component has changed and the new state version has changed.
           *
           * Note: The purpose of the `version` check is to prevent an unnecessary re-render. It is possible that
           * the enclosing component may have rendered independently of the current state changing, which would
           * yield a fresh state before the change notification was able to run.
           */
          if (alwaysRenderOnChange || (changedKeys.some(k => referencedKeys.has(k)) && newVersion > version)) {
            const start = performance.now();
            render(r => !r);
            lastRenderDurations.set(idRef.current, performance.now() - start);
          }
        },
      });
      return () => {
        removeListener(idRef.current);
      };
    }, [version]);

    const stateCopy = { ...(state as Omit<S, PR>), ...actions };
    /**
     * Only return a Proxy if the browser supports it. Otherwise just return
     * the whole state. Proxy is required for implicit substate change subscription.
     */
    if (allowProxyUsage && typeof Proxy === 'function') {
      const stateProxy = new Proxy(stateCopy, {
        get(target, prop) {
          referencedKeys.add(prop as keyof Omit<S, PR> | keyof A);
          return target[prop as keyof Omit<S, PR> | keyof A];
        },
      });
      return stateProxy;
    } else {
      Object.keys(stateCopy).forEach(k => referencedKeys.add(k as keyof S | keyof A));
      return stateCopy;
    }
  };

  const consumer = function <T = unknown>(Wrapped: ComponentType<T>) {
    return function (props: T & S & A) {
      const stateAndActions = useStateFn(true);
      return <Wrapped {...props} {...stateAndActions} />;
    } as ComponentType<Omit<T, keyof (S & A)>>;
  };

  function map<T extends PropsWithChildren<unknown>>(mapFn: (s: State<Omit<S, PR>> & Actions<Omit<S, PR>, A>) => T) {
    return function (Wrapped: ComponentType<PropsWithChildren<unknown>>): ComponentType<T> {
      return function (props: T) {
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
    useSync,
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
        ? [...derivers, { key, derive: defaultState[key] as GenericFunction }]
        : derivers,
    [] as { key: string; derive: GenericFunction }[],
  ),
  initialState: Object.keys(defaultState).reduce(
    (s, key) =>
      typeof defaultState[key] === 'function'
        ? { ...s, [key]: (defaultState[key] as GenericFunction)(defaultState) }
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
