import { createState } from '../../v2';

interface State {
  cheese: 'Cheddar' | 'Brie' | 'Gouda';
}

interface Actions {
  setCheese(cheese: State['cheese']): void;
}

export type CheeseStateProps = State & Actions;

export default createState<State, Actions>(
  'Cheese',
  {
    cheese: 'Cheddar',
  },
  ({ setState }) => ({
    setCheese(cheese) {
      setState({ cheese });
    },
  }),
);
