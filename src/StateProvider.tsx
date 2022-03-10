import { createLogger } from '@phnq/log';
import React, { Context, PropsWithChildren, ReactElement, useEffect, useMemo, useRef, useState } from 'react';

import { ActionFunction, Actions, GetActionsParams, State } from './indexOld';

const log = createLogger('@phnq/state');

interface Props<S, A, P> {
  name: string;
  context: Context<(State<S> & Actions<A>) | undefined>;
  defaultState: State<S>;
  getActions: (getActionsParams: GetActionsParams<S> & P) => Actions<A>;
  onChange(state: S & A): void;
}

export type StateProviderType<S, A, P> = (props: PropsWithChildren<Props<S, A, P>>) => ReactElement;

function StateProvider<S, A, P>(props: PropsWithChildren<Props<S, A, P> & P>) {
  const {
    name,
    context: { Provider },
    defaultState,
    getActions,
    onChange,
    children,
  } = props;

  const resQ = useRef<Array<() => void>>([]);

  const { stateDerivers, initialState } = useMemo(() => processDefaultState(defaultState), [defaultState]);

  const stateRef = useRef<S>(initialState);

  // This is used for triggering renders.
  const [renderCount, setRenderCount] = useState(0);

  const derivedProperties = stateDerivers.map(({ key }) => key);

  const actions = useMemo(() => {
    const getState = () => ({ ...stateRef.current });

    const setState = (subState: Partial<S>): Promise<void> => {
      log('%s - %o', name.toUpperCase(), subState);

      if (subState !== initialState && Object.keys(subState).some(k => derivedProperties.includes(k))) {
        throw new Error(`Derived properties may not be set explicitly: ${derivedProperties.join(', ')}`);
      }

      const derivedState = stateDerivers.reduce(
        (d, { key, derive }) => ({ ...d, [key]: derive({ ...stateRef.current, ...subState }) }),
        {} as Partial<S>,
      );

      const deltaState = { ...subState, ...derivedState };

      const currentState = stateRef.current;
      // Only affect a state change (and render) if needed. Strict equality on top-level values is the measure.
      if ((Object.keys(deltaState) as (keyof Partial<S>)[]).some(k => deltaState[k] !== currentState[k])) {
        stateRef.current = { ...currentState, ...deltaState };
        // Queue up the Promise's resolve function for the next render.
        const p = new Promise<void>(r => {
          resQ.current.push(r);
        });
        // render(r => !r);
        setRenderCount(rc => rc + 1);
        return p;
      }

      log.warn('ineffectual state change: %s - %o', name.toUpperCase(), subState);

      // If the setState() ends up being a no-op then return a resolved Promise.
      return Promise.resolve();
    };

    const resetState = (reinitialize = true) =>
      setState(initialState).then(() => {
        const { init } = actions;
        if (reinitialize && init) {
          init();
        }
      });

    const unboundActions = getActions({ ...props, getState, setState, resetState });
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

  useEffect(() => {
    onChange({ ...stateRef.current, ...actions });
  }, [stateRef.current]);

  useEffect(() => {
    const rs = [...resQ.current];
    rs.forEach(r => r());
    resQ.current = resQ.current.filter(r => rs.includes(r));
  }, [renderCount]);

  return <Provider value={{ ...stateRef.current, ...actions }}>{children}</Provider>;
}

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

export default StateProvider;
