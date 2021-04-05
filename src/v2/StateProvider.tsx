import { createLogger } from '@phnq/log';
import React, { Context, PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Actions, GetActionsParams, State } from '.';

const log = createLogger('@phnq/state');

interface Props<S, A> {
  name: string;
  context: Context<Partial<State<S> & Actions<A>>>;
  defaultState: State<S>;
  getActions: (getActionsParams: GetActionsParams<S>) => Actions<A>;
  onChange(state: S & A): void;
}

function StateProvider<S, A>(props: PropsWithChildren<Props<S, A>>) {
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

  const [underlyingState, setUnderlyingState] = useState<S>(initialState);

  const derivedProperties = stateDerivers.map(({ key }) => key);

  const getState = () => underlyingState;

  const setState = useCallback(
    (subState: Partial<S>): Promise<void> => {
      log('%s - %o', name.toUpperCase(), subState);
      const p = new Promise<void>(r => {
        resQ.current.push(r);
      });

      if (subState !== initialState && Object.keys(subState).some(k => derivedProperties.includes(k))) {
        throw new Error(`Derived properties may not be set explicitly: ${derivedProperties.join(', ')}`);
      }

      const derivedState = stateDerivers.reduce(
        (d, { key, derive }) => ({ ...d, [key]: derive({ ...underlyingState, ...subState }) }),
        {} as Partial<S>,
      );

      const deltaState = { ...subState, ...derivedState };

      setUnderlyingState(uState => {
        // Set a new state only if something has changed.
        if ((Object.keys(deltaState) as (keyof Partial<S>)[]).some(k => deltaState[k] !== uState[k])) {
          return { ...uState, ...deltaState };
        }
        return uState;
      });
      return p;
    },
    [underlyingState],
  );

  const resetState = () => setState(initialState);

  useEffect(() => {
    resQ.current.forEach(r => r());
    resQ.current = [];
  });

  const actions = useMemo(() => {
    const actions = getActions({ getState, setState, resetState });
    const onError = actions.onError;

    const actionNames = [...Object.keys(actions)] as (keyof Actions<A>)[];
    actionNames.forEach(k => {
      actions[k] = (actions[k] as ActionFunction).bind(actions) as Actions<A>[keyof Actions<A>];

      if (onError && k !== 'onError') {
        actions[k] = ((...args: never[]): Promise<void> =>
          new Promise(resolve => {
            try {
              const result = (actions[k] as ActionFunction).apply(actions, args);
              if (result instanceof Promise) {
                result.then(resolve).catch(err => onError(err, k));
              } else {
                resolve(result);
              }
            } catch (err) {
              onError(err, k);
            }
          })) as any;
      }
    });
    return actions;
  }, [underlyingState]);

  useEffect(() => {
    const { init, destroy } = actions;

    if (init) {
      init();
    }
    return destroy;
  }, []);

  useEffect(() => {
    onChange({ ...underlyingState, ...actions });
  }, [underlyingState]);

  return <Provider value={{ ...underlyingState, ...actions, isPhnqState: true }}>{children}</Provider>;
}

type ActionFunction = (...args: never[]) => void | Promise<void>;

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
