import 'jest-dom/extend-expect';

import React, { Component, FC } from 'react';
import { cleanup, fireEvent, render } from 'react-testing-library';

import { createState, inject } from '../index';

interface State {
  num: number;
  other: string;
  person: {
    firstName?: string;
    lastName?: string;
  };
}

interface Actions {
  incrementNum(): void;
  resetState(): void;
  setPerson(person: { firstName?: string; lastName?: string }): void;
}

const DEFAULT_STATE = {
  num: 42,
  other: 'stuff',
  person: {},
};

let initFn: jest.Mock | undefined;
let destroyFn: jest.Mock | undefined;

const testState = createState<State, Actions>('test', DEFAULT_STATE, ({ getState, setState }) => ({
  init() {
    if (initFn) {
      initFn();
    }
  },

  destroy() {
    if (destroyFn) {
      destroyFn();
    }
  },

  incrementNum() {
    setState({ num: 1 + getState().num });
  },

  resetState() {
    setState(DEFAULT_STATE);
  },

  setPerson(person: { firstName?: string; lastName?: string }): void {
    setState({ person });
  },
}));

@testState.consumer
class TestConsumer extends Component<State & Actions> {
  public render() {
    const {
      num,
      incrementNum,
      resetState,
      person: { firstName, lastName },
    } = this.props;
    return (
      <>
        <button data-testid="the-button" onClick={() => incrementNum()}>
          {num}
        </button>
        <button data-testid="reset-button" onClick={() => resetState()}>
          Reset
        </button>
        <div data-testid="firstName">{firstName}</div>
        <div data-testid="lastName">{lastName}</div>
      </>
    );
  }
}

const TestConsumerFC: FC<State & Actions> = testState.consumer(
  ({ num, incrementNum, resetState, person: { firstName, lastName } }: State & Actions) => (
    <>
      <button data-testid="the-button" onClick={() => incrementNum()}>
        {num}
      </button>
      <button data-testid="reset-button" onClick={() => resetState()}>
        Reset
      </button>
      <div data-testid="firstName">{firstName}</div>
      <div data-testid="lastName">{lastName}</div>
    </>
  ),
);

@testState.provider
class TestProvider extends Component {
  public render() {
    return (
      <div>
        <TestConsumer {...inject<State & Actions>()} />
      </div>
    );
  }
}

const TestProviderFC: FC = testState.provider(() => (
  <div>
    <TestConsumerFC {...inject<State & Actions>()} />
  </div>
));

beforeEach(() => {
  initFn = undefined;
  destroyFn = undefined;
});

afterEach(cleanup);

test('default state', () => {
  const result = render(<TestProvider />);
  expect(result.getByTestId('the-button')).toHaveTextContent('42');
});

test('default state FC', () => {
  const resultFC = render(<TestProviderFC />);
  expect(resultFC.getByTestId('the-button')).toHaveTextContent('42');
});

test('state change with action', () => {
  const result = render(<TestProvider />);
  const button = result.getByTestId('the-button');

  expect(button).toHaveTextContent('42');
  fireEvent.click(button);
  expect(button).toHaveTextContent('43');
});

test('state change with action FC', () => {
  const result = render(<TestProviderFC />);
  const button = result.getByTestId('the-button');

  expect(button).toHaveTextContent('42');
  fireEvent.click(button);
  expect(button).toHaveTextContent('43');
});

test('create state with existing name', () => {
  expect(() => {
    createState<State, Actions>(
      'test',
      {
        num: 22,
        other: 'wrong',
        person: {},
      },
      ({ getState, setState }) => ({
        incrementNum() {
          setState({ num: 1 + getState().num });
        },
        resetState() {
          setState(DEFAULT_STATE);
        },
        setPerson(person: { firstName?: string; lastName?: string }): void {
          setState({ person });
        },
      }),
    );
  }).toThrow();
});

test('getCombinedState', () => {
  const result = render(<TestProvider />);
  const resetButton = result.getByTestId('reset-button');
  const theButton = result.getByTestId('the-button');

  fireEvent.click(resetButton);

  expect(window.getCombinedState().test.num).toBe(42);

  fireEvent.click(theButton);

  expect(window.getCombinedState().test.num).toBe(43);
});

test('getCombinedState FC', () => {
  const result = render(<TestProviderFC />);
  const resetButton = result.getByTestId('reset-button');
  const theButton = result.getByTestId('the-button');

  fireEvent.click(resetButton);

  expect(window.getCombinedState().test.num).toBe(42);

  fireEvent.click(theButton);

  expect(window.getCombinedState().test.num).toBe(43);
});

test('init gets called', () => {
  initFn = jest.fn();

  render(<TestProvider />);

  expect(initFn).toHaveBeenCalledTimes(1);
});

test('init gets called FC', () => {
  initFn = jest.fn();

  render(<TestProviderFC />);

  expect(initFn).toHaveBeenCalledTimes(1);
});

test('destroy gets called', () => {
  destroyFn = jest.fn();

  render(<TestProvider />);
  cleanup();

  expect(destroyFn).toHaveBeenCalledTimes(1);
});

test('destroy gets called FC', () => {
  destroyFn = jest.fn();

  render(<TestProviderFC />);
  cleanup();

  expect(destroyFn).toHaveBeenCalledTimes(1);
});
