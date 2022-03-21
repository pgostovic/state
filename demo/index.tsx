import ReactDom from 'react-dom';

import React, { FC, useState } from 'React';

import demoState from './demoState';

const Demo: FC<{ bubba: string }> = ({ bubba }) => {
  const [show, setShow] = useState(true);

  return (
    <div>
      <div>BUBBA: {bubba}</div>
      <button onClick={() => setShow(!show)}>Show/Hide</button>
      <br />
      {show && <StateUser />}
    </div>
  );
};

const StateUser: FC = () => {
  console.log('RENDER');
  const { cheese, setCheese, otherCheese, setOtherCheese } = demoState.useState();
  return (
    <div>
      Cheese: {cheese}
      <div>
        <button onClick={() => setCheese('Brie')}>Brie</button>
        <button onClick={() => setCheese('Gouda')}>Gouda</button>
        <button onClick={() => setCheese('Cheddar')}>Cheddar</button>
      </div>
      Other Cheese: {otherCheese}
      <div>
        <button onClick={() => setOtherCheese('Cream')}>Cream</button>
        <button onClick={() => setOtherCheese('Gruyere')}>Gruyere</button>
        <button onClick={() => setOtherCheese('Jack')}>Jack</button>
      </div>
    </div>
  );
};

const Root = demoState.provider(Demo);

ReactDom.render(<Root bubba="gump" />, document.getElementById('demo'));
