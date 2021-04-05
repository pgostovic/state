import { createState } from '../../v2';
import cheeseState from './cheese';

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

export default createState<State, Actions>(
  'Num',
  {
    num: 42,
  },
  ({ getState, setState }) => ({
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
  }),
);
