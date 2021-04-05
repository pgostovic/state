import '@testing-library/jest-dom/extend-expect';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React, { FC, useRef } from 'react';

import cheeseState from './state/cheese';
import numState, { onDestroyCall, onInitCall } from './state/num';

const RootWithProvider: FC = cheeseState.provider(numState.provider(({ children }) => <>{children}</>));

let numInitCalls = 0;
let numDestroyCalls = 0;

onInitCall(() => (numInitCalls += 1));
onDestroyCall(() => (numDestroyCalls += 1));

const TestComponent: FC = () => {
  const { num, incrementNum } = numState.useState();
  const { cheese, setCheese } = cheeseState.useState();
  const numRenders = useRef(0);

  numRenders.current += 1;

  return (
    <div>
      <div data-testid="num">{num}</div>
      <div data-testid="cheese">{cheese}</div>
      <div data-testid="numRenders">{numRenders.current}</div>
      <button data-testid="inc-button" onClick={() => incrementNum()}>
        Increment Num
      </button>
      <button data-testid="reset-cheese" onClick={() => setCheese('Cheddar')}>
        Reset Cheese
      </button>
    </div>
  );
};

test('default state', () => {
  const result = render(
    <RootWithProvider>
      <TestComponent />
    </RootWithProvider>,
  );
  const numElmnt = result.getByTestId('num');
  expect(numElmnt).toHaveTextContent('42');
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

  expect(numElmnt).toHaveTextContent('42');
  expect(numRendersElmnt).toHaveTextContent('1');

  fireEvent.click(button);
  expect(numElmnt).toHaveTextContent('43');

  expect(numRendersElmnt).toHaveTextContent('2');
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
