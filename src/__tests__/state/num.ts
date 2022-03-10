import { createState } from '../..';
import cheeseState, { State as CheeseState } from './cheese';
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
  increment3TimesAsync(): void;
}

export type NumStateProps = State & Actions;

let initCallListener: (() => void) | undefined;
let destroyCallListener: (() => void) | undefined;

export const onInitCall = (listener: () => void) => (initCallListener = listener);
export const onDestroyCall = (listener: () => void) => (destroyCallListener = listener);

export default createState<State, Actions, With42Props, { cheeseState: CheeseState }>(
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

      const { cheese } = getState('cheeseState');

      console.log('=================YO1', cheese);

      // const { cheese, setCheese } = cheeseState.getState();

      // if (cheese === 'Cheddar') {
      //   setCheese('Brie');
      // } else {
      //   setCheese('Cheddar');
      // }

      setState({ num: num + 1 });
    },

    setNum42() {
      setState({ num: fortyTwo });
    },

    reset() {
      resetState();
    },

    async resetAsync() {
      resetState();
    },

    async setNums(nums: number[]) {
      for (const n of nums) {
        await sleep(20);
        setState({ num: n });
      }
    },

    async increment3TimesAsync() {
      await sleep(50);
      setState({ num: 1 + getState().num });
      await sleep(50);
      setState({ num: 1 + getState().num });
      await sleep(50);
      setState({ num: 1 + getState().num });
    },
  }),
  with42,
  {
    cheeseState,
  },
);

const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));
