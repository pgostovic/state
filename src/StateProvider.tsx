import { createLogger } from '@phnq/log';
import React, {
  Context,
  PropsWithChildren,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ActionFunction, Actions, GetActionsParams, State } from '.';

const log = createLogger('@phnq/state');

interface Props<S, A, P> {
  name: string;
  context: Context<Partial<State<S> & Actions<A>>>;
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

  const [, render] = useState(false);

  const derivedProperties = stateDerivers.map(({ key }) => key);

  const getState = () => stateRef.current;

  const setState = useCallback((subState: Partial<S>): Promise<void> => {
    log('%s - %o', name.toUpperCase(), subState);
    const p = new Promise<void>(r => {
      resQ.current.push(r);
    });

    if (subState !== initialState && Object.keys(subState).some(k => derivedProperties.includes(k))) {
      throw new Error(`Derived properties may not be set explicitly: ${derivedProperties.join(', ')}`);
    }

    const derivedState = stateDerivers.reduce(
      (d, { key, derive }) => ({ ...d, [key]: derive({ ...stateRef.current, ...subState }) }),
      {} as Partial<S>,
    );

    const deltaState = { ...subState, ...derivedState };

    const currentState = stateRef.current;
    if ((Object.keys(deltaState) as (keyof Partial<S>)[]).some(k => deltaState[k] !== currentState[k])) {
      stateRef.current = { ...currentState, ...deltaState };
      render(r => !r);
    }

    return p;
  }, []);

  const resetState = () => setState(initialState);

  useEffect(() => {
    resQ.current.forEach(r => r());
    resQ.current = [];
  });

  const actions = useMemo(() => {
    const actions = getActions({ ...props, getState, setState, resetState });
    const onError = actions.onError;

    const actionNames = [...Object.keys(actions)] as (keyof Actions<A>)[];
    actionNames.forEach(k => {
      const action = actions[k];
      actions[k] = (action as ActionFunction).bind(actions) as Actions<A>[keyof Actions<A>];

      if (onError && k !== 'onError') {
        actions[k] = ((...args: never[]): Promise<void> =>
          new Promise(resolve => {
            try {
              const result = (action as ActionFunction).apply(actions, args);
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
    return Object.freeze(actions);
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

  return <Provider value={{ ...stateRef.current, ...actions, isPhnqState: true }}>{children}</Provider>;
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
