import { createState } from '../..';
import cheeseState, { CheeseStateProps } from './cheese';
import with42, { With42Props } from './with42';

interface State {
  foo?: string;
  num: number;
  numPlus1: number;
  extVal: number;
}

interface Actions {
  incrementNum(): void;
  setNum42(): void;
  reset(): void;
  resetAsync(): void;
  setNums(nums: number[]): void;
  increment3TimesAsync(): void;
  incrementExtVal(): void;
}

export type NumStateProps = State & Actions;

let theExtVal = 0;

export default createState<State, { cheeseState: CheeseStateProps }, Actions, With42Props>(
  'Num',
  {
    num: 1,
    numPlus1: ({ num }) => num + 1,
    extVal: () => theExtVal,
  },
  {
    cheeseState,
  },
  ({ getState, setState, resetState, fortyTwo }) => ({
    init() {
      theExtVal = 0;
    },

    incrementNum() {
      const { num } = getState();

      // const { cheese, setCheese } = getState('cheeseState');

      // console.log('=================YO1', cheese, setCheese);

      // setCheese('Brie');

      // console.log('=================YO2', getState('cheeseState').cheese);

      setState({ num: num + 1, foo: 'bar' });
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

    incrementExtVal() {
      theExtVal += 1;
    },
  }),
  with42,
);

const sleep = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));
