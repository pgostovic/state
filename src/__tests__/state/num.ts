import { createState } from '../..';
import cheeseState from './cheese';
import with42, { With42Props } from './with42';

interface State {
  num: number;
  numPlus1: number;
}

interface Actions {
  incrementNum(): void;
  setNum42(): void;
  reset(): void;
  resetAsync(): void;
  setNums(nums: number[]): void;
}

export type NumStateProps = State & Actions;

let initCallListener: (() => void) | undefined;
let destroyCallListener: (() => void) | undefined;

export const onInitCall = (listener: () => void) => (initCallListener = listener);
export const onDestroyCall = (listener: () => void) => (destroyCallListener = listener);

export default createState<State, Actions, With42Props>(
  'Num',
  {
    num: 1,
    numPlus1: ({ num }) => num + 1,
  },
  ({ getState, setState, resetState, fortyTwo }) => ({
    init() {
      if (initCallListener) {
        initCallListener();
      }
    },

    destroy() {
      if (destroyCallListener) {
        destroyCallListener();
      }
    },

    incrementNum() {
      const { num } = getState();

      const { cheese, setCheese } = cheeseState.getState();

      if (cheese === 'Cheddar') {
        setCheese('Brie');
      } else {
        setCheese('Cheddar');
      }

      setState({ num: num + 1 });
    },

    setNum42() {
      setState({ num: fortyTwo });
    },

    reset() {
      resetState();
    },

    async resetAsync() {
      await resetState();
    },

    async setNums(nums: number[]) {
      for (const n of nums) {
        await sleep(20);
        await setState({ num: n });
      }
    },
  }),
  with42,
);

const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));
