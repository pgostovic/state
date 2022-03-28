import { createState } from '../..';
import cheeseState, { CheeseStateProps } from './cheese';
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

const initCallListeners: (() => void)[] = [];
const destroyCallListeners: (() => void)[] = [];

export const onInitCall = (listener: () => void) => initCallListeners.push(listener);
export const onDestroyCall = (listener: () => void) => destroyCallListeners.push(listener);

export default createState<State, { cheeseState: CheeseStateProps }, Actions, With42Props>(
  'Num',
  {
    num: 1,
    numPlus1: ({ num }) => num + 1,
  },
  {
    cheeseState,
  },
  ({ getState, setState, resetState, fortyTwo }) => ({
    init() {
      initCallListeners.forEach(listener => listener());
    },

    destroy() {
      destroyCallListeners.forEach(listener => listener());
    },

    incrementNum() {
      const { num } = getState();

      // const { cheese, setCheese } = getState('cheeseState');

      // console.log('=================YO1', cheese, setCheese);

      // setCheese('Brie');

      // console.log('=================YO2', getState('cheeseState').cheese);

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
);

const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));
