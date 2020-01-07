import '@testing-library/jest-dom/extend-expect';

import { cleanup, fireEvent, render } from '@testing-library/react';
import React, { Component, FC } from 'react';

import { createState, inject } from '../index';

interface State {
  num: number;
  other: string;
  person: {
    firstName?: string;
    lastName?: string;
  };
  didit: boolean;
}

interface Actions {
  incrementNum(): void;
  resetState(): void;
  setPerson(person: { firstName?: string; lastName?: string }): void;
  doit(): void;
}

const DEFAULT_STATE = {
  num: 42,
  other: 'stuff',
  person: {},
  didit: false,
};

let initFn: jest.Mock | undefined;
let destroyFn: jest.Mock | undefined;

// eslint-disable-next-line @typescript-eslint/no-empty-function
createState('test', {}, () => {});

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
    this.doit();
    setState({ num: 1 + getState().num });
  },

  resetState() {
    setState(DEFAULT_STATE);
  },

  setPerson(person: { firstName?: string; lastName?: string }): void {
    setState({ person });
  },

  doit(): void {
    setState({ didit: true });
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
      didit,
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
        <div data-testid="didit">{didit ? 'yes' : 'no'}</div>
      </>
    );
  }
}

const TestConsumerFC: FC<State & Actions> = testState.consumer(
  ({ num, incrementNum, resetState, person: { firstName, lastName }, didit }: State & Actions) => (
    <>
      <button data-testid="the-button" onClick={() => incrementNum()}>
        {num}
      </button>
      <button data-testid="reset-button" onClick={() => resetState()}>
        Reset
      </button>
      <div data-testid="firstName">{firstName}</div>
      <div data-testid="lastName">{lastName}</div>
      <div data-testid="didit">{didit ? 'yes' : 'no'}</div>
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
  const didit = result.getByTestId('didit');

  expect(button).toHaveTextContent('42');
  expect(didit).toHaveTextContent('no');
  fireEvent.click(button);
  expect(button).toHaveTextContent('43');
  expect(didit).toHaveTextContent('yes');
});

test('state change with action FC', () => {
  const result = render(<TestProviderFC />);
  const button = result.getByTestId('the-button');
  const didit = result.getByTestId('didit');

  expect(button).toHaveTextContent('42');
  expect(didit).toHaveTextContent('no');
  fireEvent.click(button);
  expect(button).toHaveTextContent('43');
  expect(didit).toHaveTextContent('yes');
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

test('Consumer with no provider', () => {
  const conErr = console.error;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.error = () => {};
  try {
    render(<TestConsumer {...inject<State & Actions>()} />);
    fail('Should have thrown');
  } catch (err) {
    expect(err.message).toBe('No provider found for "test" state.');
  } finally {
    console.error = conErr;
  }
});

test('Consumer with no provider FC', () => {
  const conErr = console.error;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.error = () => {};
  try {
    render(<TestConsumerFC {...inject<State & Actions>()} />);
    fail('Should have thrown');
  } catch (err) {
    expect(err.message).toBe('No provider found for "test" state.');
  } finally {
    console.error = conErr;
  }
});
