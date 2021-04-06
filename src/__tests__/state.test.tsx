import '@testing-library/jest-dom/extend-expect';
import { cleanup, fireEvent, render, waitForElement } from '@testing-library/react';
import React, { FC, useRef } from 'react';

import cheeseState, { CheeseStateProps } from './state/cheese';
import numState, { NumStateProps, onDestroyCall, onInitCall } from './state/num';

const RootWithProvider: FC = cheeseState.provider(numState.provider(({ children }) => <>{children}</>));

let numInitCalls = 0;
let numDestroyCalls = 0;

onInitCall(() => (numInitCalls += 1));
onDestroyCall(() => (numDestroyCalls += 1));

const TestComponent: FC = () => {
  const { num, numPlus1, incrementNum, setNum42 } = numState.useState();
  const { cheese, setCheese, triggerAnError, triggerAnAsyncError, errorAction, errorMessage } = cheeseState.useState();
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
      <button data-testid="reset-cheese" onClick={() => setCheese('Cheddar')}>
        Reset Cheese
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
    </div>
  );
};

const TestComponentAndConsumer = cheeseState.consumer(
  numState.consumer(({ num, incrementNum }: CheeseStateProps & NumStateProps) => {
    return (
      <div>
        <div data-testid="num">{num}</div>
        <button data-testid="inc-button" onClick={() => incrementNum()}>
          Increment Num
        </button>
      </div>
    );
  }),
);

test('default state', () => {
  const result = render(
    <RootWithProvider>
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

test('state change with action (via consumer)', () => {
  const result = render(
    <RootWithProvider>
      <TestComponentAndConsumer />
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
