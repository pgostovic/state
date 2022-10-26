import { createState } from '../..';

export interface State {
  caloriesPerServing?: number;
}

interface Actions {
  setCaloriesPerServing(calories: number): void;
}

export default createState<State, Actions>(
  'Food',
  {
    caloriesPerServing: undefined,
  },
  ({ setState }) => ({
    setCaloriesPerServing(calories) {
      setState({ caloriesPerServing: calories });
    },
  }),
);
