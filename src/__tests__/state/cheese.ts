import { createState } from '../..';

interface State {
  cheese: 'Cheddar' | 'Brie' | 'Gouda';
  errorAction?: string;
  errorMessage?: string;
}

interface Actions {
  setCheese(cheese: State['cheese']): void;
  triggerAnError(): void;
  triggerAnAsyncError(): void;
}

export type CheeseStateProps = State & Actions;

export default createState<State, Actions>(
  'Cheese',
  {
    cheese: 'Cheddar',
    errorAction: undefined,
    errorMessage: undefined,
  },
  ({ setState }) => ({
    onError(err, action) {
      if (err instanceof Error) {
        setState({ errorAction: action, errorMessage: err.message });
      }
    },

    setCheese(cheese) {
      setState({ cheese });
    },

    triggerAnError() {
      throw new Error('state error');
    },

    async triggerAnAsyncError() {
      await sleep(200);
      throw new Error('async state error');
    },
  }),
);

const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));
