import { createState } from '../../v2';
import cheeseState from './cheese';
import with42, { With42Props } from './with42';

interface State {
  num: number;
}

interface Actions {
  incrementNum(): void;
}

let initCallListener: (() => void) | undefined;
let destroyCallListener: (() => void) | undefined;

export const onInitCall = (listener: () => void) => (initCallListener = listener);
export const onDestroyCall = (listener: () => void) => (destroyCallListener = listener);

export default createState<State, Actions, With42Props>(
  'Num',
  {
    num: 42,
  },
  ({ getState, setState, fortyTwo }) => ({
    init() {
      if (initCallListener) {
        initCallListener();
      }

      console.log('INIT FT', fortyTwo);
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
  }),
  with42,
);
