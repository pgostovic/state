import 'jest-dom/extend-expect';

import React, { Component } from 'react';
import { cleanup, fireEvent, render } from 'react-testing-library';

import { createState, inject } from '../index';

interface State {
  num: number;
  other: string;
}

interface Actions {
  incrementNum(): void;
  resetState(): void;
}

const DEFAULT_STATE = {
  num: 42,
  other: 'stuff',
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
}));

@testState.consumer
class TestConsumer extends Component<State & Actions> {
  public render() {
    const { num, incrementNum, resetState } = this.props;
    return (
      <>
        <button data-testid="the-button" onClick={() => incrementNum()}>
          {num}
        </button>
        <button data-testid="reset-button" onClick={() => resetState()}>
          Reset
        </button>
      </>
    );
  }
}

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

beforeEach(() => {
  initFn = undefined;
  destroyFn = undefined;
});

afterEach(cleanup);

test('default state', () => {
  const result = render(<TestProvider />);
  expect(result.getByTestId('the-button')).toHaveTextContent('42');
});

test('state change with action', () => {
  const result = render(<TestProvider />);
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
      },
      ({ getState, setState }) => ({
        incrementNum() {
          setState({ num: 1 + getState().num });
        },
        resetState() {
          setState(DEFAULT_STATE);
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

test('init gets called', () => {
  initFn = jest.fn();

  render(<TestProvider />);

  expect(initFn).toHaveBeenCalledTimes(1);
});

test('destroy gets called', () => {
  destroyFn = jest.fn();

  render(<TestProvider />);
  cleanup();

  expect(destroyFn).toHaveBeenCalledTimes(1);
});
