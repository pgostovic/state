import '@testing-library/jest-dom/extend-expect';

import { fireEvent, render, waitFor } from '@testing-library/react';
import React, { ReactNode, useRef } from 'react';

import cheeseState, { CheeseStateProps } from './state/cheese';
import numState, { NumStateProps } from './state/num';

interface RootProps {
  stuff?: string;
  children?: ReactNode;
}

const Root = ({ children }: RootProps) => <>{children}</>;

const RootWithProvider = cheeseState.provider(numState.provider(Root));

const TestComponent = () => {
  const {
    num,
    foo,
    numPlus1,
    incrementNum,
    increment3TimesAsync,
    setNum42,
    reset,
    resetAsync,
    setNums,
    extVal,
    incrementExtVal,
    fetchSimA,
    fetchSimB,
    simA,
    simB,
  } = numState.useState();
  const { cheese, setCheese, triggerAnError, triggerAnAsyncError, errorAction, errorMessage, setNotReferenced } =
    cheeseState.useState();
  const numRenders = useRef(0);

  numRenders.current += 1;

  const setNumState = numState.useSync(() => {
    // no-op
  });

  return (
    <div>
      <div data-testid="num">{num}</div>
      <div data-testid="numPlus1">{numPlus1}</div>
      <div data-testid="cheese">{cheese}</div>
      <div data-testid="extVal">{extVal}</div>
      <div data-testid="numRenders">{numRenders.current}</div>
      <div data-testid="typeof-foo">{typeof foo}</div>
      <div data-testid="simA">{simA ?? ''}</div>
      <div data-testid="simB">{simB ?? ''}</div>
      {errorAction && <div data-testid="error-action">{errorAction}</div>}
      {errorMessage && <div data-testid="error-message">{errorMessage}</div>}
      <button data-testid="inc-button" onClick={() => incrementNum()}>
        Increment Num
      </button>
      <button data-testid="set-num-25" onClick={() => setNumState({ num: 25 })}>
        Set Num to 25
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
      <button data-testid="incExtVal" onClick={() => incrementExtVal()}>
        Inc Ext Val
      </button>
      <button data-testid="resetAsync" onClick={() => resetAsync()}>
        Reset Async
      </button>
      <button
        data-testid="simultaneous"
        onClick={() => {
          fetchSimA();
          fetchSimB();
        }}
      >
        Simultaneous
      </button>
      {/* NOTE: this also tests that promises for no-op setState() calls get resolved. */}
      <button data-testid="setNums" onClick={() => setNums([5, 6, 6, 7, 8])}>
        Set Nums
      </button>
    </div>
  );
};

const TestComponentConsumer = ({ num, incrementNum }: { bubba: string } & CheeseStateProps & NumStateProps) => (
  <div>
    <div data-testid="num">{num}</div>
    <button data-testid="inc-button" onClick={() => incrementNum()}>
      Increment Num
    </button>
  </div>
);

const TestComponentAndConsumer = cheeseState.consumer(numState.consumer(TestComponentConsumer));

const TestComponentMappedConsumer = ({
  mappedNum,
  mappedIncrementNum,
}: { bubba: string } & CheeseStateProps & {
    mappedNum: number;
    mappedIncrementNum(): void;
  }) => (
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

test('state change with action', async () => {
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
  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('2');
    expect(numRendersElmnt).toHaveTextContent('2');
  });

  fireEvent.click(button);
  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('3');
  });
});

test('state change with useSync', async () => {
  const result = render(
    <RootWithProvider>
      <TestComponent />
    </RootWithProvider>,
  );
  const numElmnt = result.getByTestId('num');
  const numRendersElmnt = result.getByTestId('numRenders');
  const button25 = result.getByTestId('set-num-25');
  const button = result.getByTestId('inc-button');

  expect(numElmnt).toHaveTextContent('1');
  expect(numRendersElmnt).toHaveTextContent('1');

  fireEvent.click(button25);
  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('1');
    expect(numRendersElmnt).toHaveTextContent('1');
  });

  fireEvent.click(button);
  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('26');
    expect(Number(numRendersElmnt.textContent)).toBeGreaterThan(1);
  });
});

test('state change not referenced', async () => {
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

  await waitFor(() => {
    expect(numRendersElmnt).toHaveTextContent('1');
  });

  // Confirm that a render does happen when a referenced state value changes.
  fireEvent.click(incButton);

  await waitFor(() => {
    expect(numRendersElmnt).toHaveTextContent('2');
  });
});

test('state change with action (via consumer)', async () => {
  const result = render(
    <RootWithProvider>
      <TestComponentAndConsumer bubba="gump" />
    </RootWithProvider>,
  );
  const numElmnt = result.getByTestId('num');
  const button = result.getByTestId('inc-button');

  expect(numElmnt).toHaveTextContent('1');

  fireEvent.click(button);
  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('2');
  });
});

test('state change with action (via mapped consumer)', async () => {
  const result = render(
    <RootWithProvider>
      <TestComponentAndMappedConsumer bubba="gump" />
    </RootWithProvider>,
  );
  const numElmnt = result.getByTestId('num');
  const button = result.getByTestId('inc-button');

  expect(numElmnt).toHaveTextContent('1');

  fireEvent.click(button);
  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('2');
  });
});

test('Setting the same value does not yield render', async () => {
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

  await waitFor(() => {
    expect(numRendersElmnt).toHaveTextContent('1');
  });
});

test('simultaneous', async () => {
  const result = render(
    <RootWithProvider>
      <TestComponent />
    </RootWithProvider>,
  );
  const simAElmnt = result.getByTestId('simA');
  const simBElmnt = result.getByTestId('simB');
  const simButton = result.getByTestId('simultaneous');

  expect(simAElmnt).toHaveTextContent('');
  expect(simBElmnt).toHaveTextContent('');

  fireEvent.click(simButton);
  await waitFor(() => {
    expect(simAElmnt).toHaveTextContent('a');
    expect(simBElmnt).toHaveTextContent('b');
  });
});

// test('lifecycle actions get called', async () => {
//   const numInitCallsA = numInitCalls;
//   const numDestroyCallsA = numDestroyCalls;
//   render(
//     <LifecycleRootWithProvider>
//       <TestComponent />
//     </LifecycleRootWithProvider>,
//   );

//   await pause();

//   const numInitCallsB = numInitCalls;
//   const numDestroyCallsB = numDestroyCalls;

//   expect(numInitCallsB - numInitCallsA).toBe(1);
//   expect(numDestroyCallsB - numDestroyCallsA).toBe(0);

//   await pause();

//   cleanup();

//   await pause();

//   const numDestroyCallsC = numDestroyCalls;

//   expect(numDestroyCallsC - numDestroyCallsB).toBe(1);
// });

test('provider mapping', async () => {
  const result = render(
    <RootWithProvider>
      <TestComponent />
    </RootWithProvider>,
  );
  const numElmnt = result.getByTestId('num');
  const button = result.getByTestId('set-42');

  expect(numElmnt).toHaveTextContent('1');

  fireEvent.click(button);
  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('42');
  });
});

test('derived state', async () => {
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

  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('42');
    expect(numPlus1Elmnt).toHaveTextContent('43');
  });
});

test('error catch all', async () => {
  const result = render(
    <RootWithProvider>
      <TestComponent />
    </RootWithProvider>,
  );
  const button = result.getByTestId('trigger-error');
  fireEvent.click(button);

  const errorActionElement = await waitFor(() => result.getByTestId('error-action'));
  expect(errorActionElement).toHaveTextContent('triggerAnError');

  const errorMessageElement = await waitFor(() => result.getByTestId('error-message'));
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

  const errorActionElement = await waitFor(() => result.getByTestId('error-action'));
  expect(errorActionElement).toHaveTextContent('triggerAnAsyncError');

  const errorMessageElement = await waitFor(() => result.getByTestId('error-message'));
  expect(errorMessageElement).toHaveTextContent('async state error');
});

test('reset state', async () => {
  const result = render(
    <RootWithProvider>
      <TestComponent />
    </RootWithProvider>,
  );
  const numElmnt = result.getByTestId('num');
  const incButton = result.getByTestId('inc-button');
  const resetButton = result.getByTestId('reset');
  const typeofFooElmnt = result.getByTestId('typeof-foo');

  expect(numElmnt).toHaveTextContent('1');
  expect(typeofFooElmnt).toHaveTextContent('undefined');

  fireEvent.click(incButton);
  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('2');
    expect(typeofFooElmnt).toHaveTextContent('string');
  });

  fireEvent.click(resetButton);

  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('1');

    // Make sure optional `foo` (with no initial value) is set back to undefined.
    expect(typeofFooElmnt).toHaveTextContent('undefined');
  });
});

test('reset state async', async () => {
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

  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('2');
  });

  fireEvent.click(resetAsyncButton);

  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('1');
  });
});

test('derived state is always calculated when actions called', async () => {
  const result = render(
    <RootWithProvider>
      <TestComponent />
    </RootWithProvider>,
  );
  const extValElmnt = result.getByTestId('extVal');
  const incExtValButton = result.getByTestId('incExtVal');

  expect(extValElmnt).toHaveTextContent('0');

  fireEvent.click(incExtValButton);
  await waitFor(() => {
    expect(extValElmnt).toHaveTextContent('1');
  });
});

test('async action with awaited setState()', async () => {
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

  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('8');
    expect(numRendersElmnt).toHaveTextContent('5');
  });
});

test('set state async with previous state within action', async () => {
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

  await waitFor(() => {
    expect(numElmnt).toHaveTextContent('4');
    expect(numRendersElmnt).toHaveTextContent('4');
  });
});
