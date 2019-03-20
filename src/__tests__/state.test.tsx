import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React, { Component } from 'react';
import { createState } from '../index';

configure({ adapter: new Adapter() });

interface IState {
  num: number;
}

interface IActions {
  incrementNum: () => void;
}

const testState = createState<IState, IActions>(
  'test',
  {
    num: 42,
  },
  (getState, setState) => ({
    incrementNum() {
      setState({ num: 1 + getState().num });
    },
  }),
);

class TestComp extends Component<IState & IActions> {
  public render() {
    const { num, incrementNum } = this.props;
    return <button onClick={() => incrementNum()}>{num}</button>;
  }
}

const TestCompWithState = testState.provider(testState.consumer(TestComp));

test('default state', () => {
  const comp = mount(<TestCompWithState />);

  expect(comp.find('button').text()).toBe('42');
});

test('state change with action', () => {
  const comp = mount(<TestCompWithState />);

  expect(comp.find('button').text()).toBe('42');

  comp.find('button').simulate('click');

  expect(comp.find('button').text()).toBe('43');
});
