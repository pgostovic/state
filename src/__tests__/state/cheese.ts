import { createState } from '../..';

export interface State {
  cheese: 'Cheddar' | 'Brie' | 'Gouda';
  errorAction?: string;
  errorMessage?: string;
  notReferenced: number;
}

interface Actions {
  setCheese(cheese: State['cheese']): void;
  triggerAnError(): void;
  triggerAnAsyncError(): void;
  setNotReferenced(notReferenced: number): void;
}

export type CheeseStateProps = State & Actions;

export default createState<State, Actions>(
  'Cheese',
  {
    cheese: 'Cheddar',
    errorAction: undefined,
    errorMessage: undefined,
    notReferenced: 0,
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

    setNotReferenced(notReferenced) {
      setState({ notReferenced });
    },
  }),
);

const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));
