import '@testing-library/jest-dom/extend-expect';
import { cleanup, fireEvent, render, waitForElement } from '@testing-library/react';
import React, { Component, ComponentType, FC } from 'react';

import { createState, inject } from '../index';

const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));

interface State {
  num: number;
  other: string;
  person: {
    firstName?: string;
    lastName?: string;
  };
  didit: boolean;
  errorAction?: string;
  errorMessage?: string;
}

interface Actions {
  incrementNum(): void;
  resetState(): void;
  setPerson(person: { firstName?: string; lastName?: string }): void;
  doit(): void;
  setNumFortyTwo(): void;
  triggerAnError(): void;
  triggerAnAsyncError(): void;
}

let initFn: jest.Mock | undefined;
let destroyFn: jest.Mock | undefined;

// eslint-disable-next-line @typescript-eslint/no-empty-function
createState('test', {}, () => ({}));

interface With42Props {
  fortyTwo: number;
}

const with42 = <T extends With42Props = With42Props>(Wrapped: ComponentType<T>) =>
  ((props: T) => <Wrapped {...props} fortyTwo={42} />) as FC<Omit<T, keyof With42Props>>;

const testState = createState<State, Actions, With42Props>(
  'test',
  {
    num: 42,
    other: 'stuff',
    person: {},
    didit: false,
    errorAction: undefined,
    errorMessage: undefined,
  },
  ({ getState, setState, resetState, fortyTwo }) => ({
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

    onError(action, err) {
      setState({ errorAction: action, errorMessage: err.message });
    },

    incrementNum() {
      this.doit();
      setState({ num: 1 + getState().num });
    },

    resetState() {
      resetState();
    },

    setPerson(person: { firstName?: string; lastName?: string }): void {
      setState({ person });
    },

    doit(): void {
      setState({ didit: true });
    },

    setNumFortyTwo() {
      setState({ num: fortyTwo });
    },

    triggerAnError() {
      throw new Error('state error');
    },

    async triggerAnAsyncError() {
      await sleep(200);
      throw new Error('async state error');
    },
  }),
  with42,
);

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

const TestConsumerFC: FC<State & Actions> = ({
  num,
  incrementNum,
  resetState,
  person: { firstName, lastName },
  didit,
}) => (
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

const TestConsumerFCWithState = testState.consumer(TestConsumerFC);

const MappedTestConsumerFC: FC<{ mapped: State & Actions }> = ({
  mapped: {
    num,
    incrementNum,
    resetState,
    person: { firstName, lastName },
    didit,
  },
}) => (
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

const MappedTestConsumerFCWithState = testState.map(s => ({ mapped: s }))(MappedTestConsumerFC);

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
    <TestConsumerFCWithState />
  </div>
));

const TestProviderMappedConsumerFC: FC = testState.provider(() => (
  <div>
    <MappedTestConsumerFCWithState />
  </div>
));

const TestUseState: FC = () => {
  const { num, incrementNum, triggerAnError, triggerAnAsyncError, errorAction, errorMessage } = testState.useState();
  return (
    <>
      {errorAction && <div data-testid="error-action">{errorAction}</div>}
      {errorMessage && <div data-testid="error-message">{errorMessage}</div>}
      <button data-testid="the-button" onClick={() => incrementNum()}>
        {num}
      </button>
      <button data-testid="error-button" onClick={() => triggerAnError()}>
        Do Error
      </button>
      <button data-testid="async-error-button" onClick={() => triggerAnAsyncError()}>
        Do Async Error
      </button>
    </>
  );
};

const TestUseStateProvider: FC = testState.provider(() => (
  <div>
    <TestUseState />
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

test('default state Mapped FC', () => {
  const resultFC = render(<TestProviderMappedConsumerFC />);
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

  expect(window.getCombinedState<State>().test.num).toBe(42);

  fireEvent.click(theButton);

  expect(window.getCombinedState<State>().test.num).toBe(43);
});

test('getCombinedState FC', () => {
  const result = render(<TestProviderFC />);
  const resetButton = result.getByTestId('reset-button');
  const theButton = result.getByTestId('the-button');

  fireEvent.click(resetButton);

  expect(window.getCombinedState<State>().test.num).toBe(42);

  fireEvent.click(theButton);

  expect(window.getCombinedState<State>().test.num).toBe(43);
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
    render(<TestConsumerFCWithState {...inject<State & Actions>()} />);
    fail('Should have thrown');
  } catch (err) {
    expect(err.message).toBe('No provider found for "test" state.');
  } finally {
    console.error = conErr;
  }
});

test('reset state', () => {
  const result = render(<TestProvider />);
  const button = result.getByTestId('the-button');
  const didit = result.getByTestId('didit');
  const resetButton = result.getByTestId('reset-button');

  expect(button).toHaveTextContent('42');
  expect(didit).toHaveTextContent('no');
  fireEvent.click(button);
  expect(button).toHaveTextContent('43');
  expect(didit).toHaveTextContent('yes');
  fireEvent.click(resetButton);
  expect(button).toHaveTextContent('42');
  expect(didit).toHaveTextContent('no');
});

test('reset state FC', () => {
  const result = render(<TestProviderFC />);
  const button = result.getByTestId('the-button');
  const didit = result.getByTestId('didit');
  const resetButton = result.getByTestId('reset-button');

  expect(button).toHaveTextContent('42');
  expect(didit).toHaveTextContent('no');
  fireEvent.click(button);
  expect(button).toHaveTextContent('43');
  expect(didit).toHaveTextContent('yes');
  fireEvent.click(resetButton);
  expect(button).toHaveTextContent('42');
  expect(didit).toHaveTextContent('no');
});

test('useState', () => {
  const result = render(<TestUseStateProvider />);
  const button = result.getByTestId('the-button');
  expect(button).toHaveTextContent('42');
  fireEvent.click(button);
  expect(button).toHaveTextContent('43');
});

test('error catch all', async () => {
  const result = render(<TestUseStateProvider />);
  const button = result.getByTestId('error-button');
  fireEvent.click(button);

  const errorActionElement = await waitForElement(() => result.getByTestId('error-action'));
  expect(errorActionElement).toHaveTextContent('triggerAnError');

  const errorMessageElement = await waitForElement(() => result.getByTestId('error-message'));
  expect(errorMessageElement).toHaveTextContent('state error');
});

test('error catch all async', async () => {
  const result = render(<TestUseStateProvider />);
  const button = result.getByTestId('async-error-button');
  fireEvent.click(button);

  const errorActionElement = await waitForElement(() => result.getByTestId('error-action'));
  expect(errorActionElement).toHaveTextContent('triggerAnAsyncError');

  const errorMessageElement = await waitForElement(() => result.getByTestId('error-message'));
  expect(errorMessageElement).toHaveTextContent('async state error');
});
