import '@testing-library/jest-dom/extend-expect';
import { cleanup, fireEvent, render, waitForElement } from '@testing-library/react';
import React, { FC, useRef } from 'react';
import { act } from 'react-dom/test-utils';

import { setAllowProxyUsage } from '..';
import cheeseState, { CheeseStateProps } from './state/cheese';
import numState, { NumStateProps, onDestroyCall, onInitCall } from './state/num';

export const runTests = async (allowProxyUsage = true) => {
  setAllowProxyUsage(allowProxyUsage);

  const Root: FC<{ stuff?: string }> = ({ children }) => <>{children}</>;

  const RootWithProvider = cheeseState.provider(numState.provider(Root));

  let numInitCalls = 0;
  let numDestroyCalls = 0;

  onInitCall(() => (numInitCalls += 1));
  onDestroyCall(() => (numDestroyCalls += 1));

  beforeEach(() => {
    numInitCalls = 0;
    numDestroyCalls = 0;
  });

  const TestComponent: FC = () => {
    const {
      num,
      numPlus1,
      incrementNum,
      increment3TimesAsync,
      setNum42,
      reset,
      resetAsync,
      setNums,
    } = numState.useState();
    const {
      cheese,
      setCheese,
      triggerAnError,
      triggerAnAsyncError,
      errorAction,
      errorMessage,
      setNotReferenced,
    } = cheeseState.useState();
    const numRenders = useRef(0);

    numRenders.current += 1;

    return (
      <div>
        <div data-testid="num">{num}</div>
        <div data-testid="numPlus1">{numPlus1}</div>
        <div data-testid="cheese">{cheese}</div>
        <div data-testid="numRenders">{numRenders.current}</div>
        {errorAction && <div data-testid="error-action">{errorAction}</div>}
        {errorMessage && <div data-testid="error-message">{errorMessage}</div>}
        <button data-testid="inc-button" onClick={() => incrementNum()}>
          Increment Num
        </button>
        <button data-testid="inc-3async-button" onClick={() => increment3TimesAsync()}>
          Increment 3x Asyncs
        </button>
        <button data-testid="reset-cheese" onClick={() => setCheese('Cheddar')}>
          Reset Cheese
        </button>
        <button data-testid="set-not-referenced" onClick={() => setNotReferenced(Date.now())}>
          Set Not Referenced
        </button>
        <button data-testid="set-42" onClick={() => setNum42()}>
          Make it 42
        </button>
        <button data-testid="trigger-error" onClick={() => triggerAnError()}>
          Trigger Error
        </button>
        <button data-testid="trigger-async-error" onClick={() => triggerAnAsyncError()}>
          Trigger Async Error
        </button>
        <button data-testid="reset" onClick={() => reset()}>
          Reset
        </button>
        <button data-testid="resetAsync" onClick={() => resetAsync()}>
          Reset Async
        </button>
        {/* NOTE: this also tests that priomises for no-op setState() calls get resolved. */}
        <button data-testid="setNums" onClick={() => setNums([5, 6, 6, 7, 8])}>
          Set Nums
        </button>
      </div>
    );
  };

  const TestComponentConsumer: FC<{ bubba: string } & CheeseStateProps & NumStateProps> = ({ num, incrementNum }) => (
    <div>
      <div data-testid="num">{num}</div>
      <button data-testid="inc-button" onClick={() => incrementNum()}>
        Increment Num
      </button>
    </div>
  );

  const TestComponentAndConsumer = cheeseState.consumer(numState.consumer(TestComponentConsumer));

  const TestComponentMappedConsumer: FC<{ bubba: string } & CheeseStateProps & {
      mappedNum: number;
      mappedIncrementNum(): void;
    }> = ({ mappedNum, mappedIncrementNum }) => (
    <div>
      <div data-testid="num">{mappedNum}</div>
      <button data-testid="inc-button" onClick={() => mappedIncrementNum()}>
        Increment Num
      </button>
    </div>
  );

  const TestComponentAndMappedConsumer = cheeseState.consumer(
    numState.map(s => ({ ...s, mappedNum: s.num, mappedIncrementNum: s.incrementNum }))(TestComponentMappedConsumer),
  );

  test('default state', () => {
    const result = render(
      <RootWithProvider stuff="whatever">
        <TestComponent />
      </RootWithProvider>,
    );
    const numElmnt = result.getByTestId('num');
    expect(numElmnt).toHaveTextContent('1');
  });

  test('state change with action', () => {
    const result = render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );
    const numElmnt = result.getByTestId('num');
    const numRendersElmnt = result.getByTestId('numRenders');
    const button = result.getByTestId('inc-button');

    expect(numElmnt).toHaveTextContent('1');
    expect(numRendersElmnt).toHaveTextContent('1');

    fireEvent.click(button);
    expect(numElmnt).toHaveTextContent('2');

    expect(numRendersElmnt).toHaveTextContent('2');

    fireEvent.click(button);
    expect(numElmnt).toHaveTextContent('3');
  });

  test('state change not referenced', async () => {
    await act(async () => {
      const result = render(
        <RootWithProvider>
          <TestComponent />
        </RootWithProvider>,
      );
      const numRendersElmnt = result.getByTestId('numRenders');
      const setNrButton = result.getByTestId('set-not-referenced');
      const incButton = result.getByTestId('inc-button');

      // Confirm that no render happens when changing a non-referenced state value.
      expect(numRendersElmnt).toHaveTextContent('1');
      fireEvent.click(setNrButton);

      await sleep(200);
      expect(numRendersElmnt).toHaveTextContent(allowProxyUsage ? '1' : '2');

      // Confirm that a render does happen when a referenced state value changes.
      fireEvent.click(incButton);
      expect(numRendersElmnt).toHaveTextContent(allowProxyUsage ? '2' : '3');
    });
  });

  test('state change with action (via consumer)', () => {
    const result = render(
      <RootWithProvider>
        <TestComponentAndConsumer bubba="gump" />
      </RootWithProvider>,
    );
    const numElmnt = result.getByTestId('num');
    const button = result.getByTestId('inc-button');

    expect(numElmnt).toHaveTextContent('1');

    fireEvent.click(button);
    expect(numElmnt).toHaveTextContent('2');
  });

  test('state change with action (via mapped consumer)', () => {
    const result = render(
      <RootWithProvider>
        <TestComponentAndMappedConsumer bubba="gump" />
      </RootWithProvider>,
    );
    const numElmnt = result.getByTestId('num');
    const button = result.getByTestId('inc-button');

    expect(numElmnt).toHaveTextContent('1');

    fireEvent.click(button);
    expect(numElmnt).toHaveTextContent('2');
  });

  test('Setting the same value does not yield render', () => {
    const result = render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );

    const cheeseElmnt = result.getByTestId('cheese');
    const numRendersElmnt = result.getByTestId('numRenders');
    const resetCheeseButton = result.getByTestId('reset-cheese');

    expect(cheeseElmnt).toHaveTextContent('Cheddar');
    expect(numRendersElmnt).toHaveTextContent('1');

    // This will set the value of cheese to 'Cheddar', which is already the value.
    fireEvent.click(resetCheeseButton);

    expect(numRendersElmnt).toHaveTextContent('1');
  });

  test('lifecycle actions get called', () => {
    const numInitCallsA = numInitCalls;
    const numDestroyCallsA = numDestroyCalls;
    render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );
    const numInitCallsB = numInitCalls;
    const numDestroyCallsB = numDestroyCalls;

    expect(numInitCallsB - numInitCallsA).toBe(1);
    expect(numDestroyCallsB - numDestroyCallsA).toBe(0);

    cleanup();

    const numDestroyCallsC = numDestroyCalls;

    expect(numDestroyCallsC - numDestroyCallsB).toBe(1);
  });

  test('provider mapping', () => {
    const result = render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );
    const numElmnt = result.getByTestId('num');
    const button = result.getByTestId('set-42');

    expect(numElmnt).toHaveTextContent('1');

    fireEvent.click(button);

    expect(numElmnt).toHaveTextContent('42');
  });

  test('derived state', () => {
    const result = render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );
    const numElmnt = result.getByTestId('num');
    const numPlus1Elmnt = result.getByTestId('numPlus1');
    const button = result.getByTestId('set-42');

    expect(numElmnt).toHaveTextContent('1');
    expect(numPlus1Elmnt).toHaveTextContent('2');

    fireEvent.click(button);

    expect(numElmnt).toHaveTextContent('42');
    expect(numPlus1Elmnt).toHaveTextContent('43');
  });

  test('error catch all', async () => {
    const result = render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );
    const button = result.getByTestId('trigger-error');
    fireEvent.click(button);

    const errorActionElement = await waitForElement(() => result.getByTestId('error-action'));
    expect(errorActionElement).toHaveTextContent('triggerAnError');

    const errorMessageElement = await waitForElement(() => result.getByTestId('error-message'));
    expect(errorMessageElement).toHaveTextContent('state error');
  });

  test('error catch all async', async () => {
    const result = render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );
    const button = result.getByTestId('trigger-async-error');
    fireEvent.click(button);

    const errorActionElement = await waitForElement(() => result.getByTestId('error-action'));
    expect(errorActionElement).toHaveTextContent('triggerAnAsyncError');

    const errorMessageElement = await waitForElement(() => result.getByTestId('error-message'));
    expect(errorMessageElement).toHaveTextContent('async state error');
  });

  test('reset state', () => {
    const result = render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );
    const numElmnt = result.getByTestId('num');
    const incButton = result.getByTestId('inc-button');
    const resetButton = result.getByTestId('reset');

    expect(numElmnt).toHaveTextContent('1');

    fireEvent.click(incButton);
    expect(numElmnt).toHaveTextContent('2');

    fireEvent.click(resetButton);
    expect(numElmnt).toHaveTextContent('1');
  });

  test('reset state async', () => {
    const result = render(
      <RootWithProvider>
        <TestComponent />
      </RootWithProvider>,
    );
    const numElmnt = result.getByTestId('num');
    const incButton = result.getByTestId('inc-button');
    const resetAsyncButton = result.getByTestId('resetAsync');

    expect(numElmnt).toHaveTextContent('1');

    fireEvent.click(incButton);
    expect(numElmnt).toHaveTextContent('2');

    fireEvent.click(resetAsyncButton);
    expect(numElmnt).toHaveTextContent('1');
  });

  test('async action with awaited setState()', async () => {
    await act(async () => {
      const result = render(
        <RootWithProvider>
          <TestComponent />
        </RootWithProvider>,
      );
      const numElmnt = result.getByTestId('num');
      const setNumsButton = result.getByTestId('setNums');
      const numRendersElmnt = result.getByTestId('numRenders');

      expect(numElmnt).toHaveTextContent('1');
      expect(numRendersElmnt).toHaveTextContent('1');

      /**
       * Note: this calls the following:
       *
       *    Calls setNums([5, 6, 6, 7, 8]);
       *
       * The second "6" is a no-op, so only 4 renders will occur.
       */
      fireEvent.click(setNumsButton);

      await sleep(200);

      expect(numElmnt).toHaveTextContent('8');

      expect(numRendersElmnt).toHaveTextContent('5');
    });
  });

  test('set state async with previous state within action', async () => {
    await act(async () => {
      const result = render(
        <RootWithProvider>
          <TestComponent />
        </RootWithProvider>,
      );
      const numElmnt = result.getByTestId('num');
      const numRendersElmnt = result.getByTestId('numRenders');
      const button = result.getByTestId('inc-3async-button');

      expect(numElmnt).toHaveTextContent('1');
      expect(numRendersElmnt).toHaveTextContent('1');

      fireEvent.click(button);

      await sleep(200);

      expect(numElmnt).toHaveTextContent('4');
      expect(numRendersElmnt).toHaveTextContent('4');
    });
  });

  const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));
};
