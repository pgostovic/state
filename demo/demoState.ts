import { createState } from '../src';
import with42, { With42Props } from './with42';

interface State {
  cheese: 'Cheddar' | 'Brie' | 'Gouda';
  otherCheese: 'Jack' | 'Gruyere' | 'Cream';
  errorAction?: string;
  errorMessage?: string;
}

interface Actions {
  setCheese(cheese: State['cheese']): void;
  setOtherCheese(otherCheese: State['otherCheese']): void;
  triggerAnError(): void;
  triggerAnAsyncError(): void;
}

export type CheeseStateProps = State & Actions;

export default createState<State, Actions, With42Props>(
  'Demo',
  {
    cheese: 'Cheddar',
    otherCheese: 'Jack',
    errorAction: undefined,
    errorMessage: undefined,
  },
  ({ setState, fortyTwo }) => ({
    onError(err, action) {
      if (err instanceof Error) {
        setState({ errorAction: action, errorMessage: err.message });
      }
    },

    setCheese(cheese) {
      setState({ cheese });
    },

    setOtherCheese(otherCheese) {
      setState({ otherCheese });
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

const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));
