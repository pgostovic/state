# @phnq/state

[![CircleCI](https://circleci.com/gh/pgostovic/message.svg?style=svg)](https://circleci.com/gh/pgostovic/state)

[![npm version](https://badge.fury.io/js/%40phnq%2Fstate.svg)](https://badge.fury.io/js/%40phnq%2Fstate)

The `@phnq/state` library provides central state management for React applications.

Features include:
- Access to state data via component props
- State update functions (i.e. actions) via component props
- Automatic render on state updates
- Relatively minimal boilerplate (compared to Redux)
- Built-in support for side-effects (async or otherwise)

### Providers and Consumers

State `providers` and `consumers` are React higher-order components (HOCs) that provide state-related functionality to the components that they wrap.

#### Provider
A `provider` represents a domain-specific data store and provides a programmatic API for manipulating the store's data. A provider's scope is the component sub-hierarchy that it wraps.

#### Consumer
A `consumer` brokers access to its corresponding state provider, i.e. its closest same-domain provider ancestor. Access to the data store's data and its API are provided to the wrapped component via props.

The `createState` function in `@phnq/state` is used to create create a matching domain-specific provider and consumer. It returns a JavaScript object with the keys 'provider' and 'consumer'.

## Example

#### UIState.ts
This trivial example creates a data store that has a single value, accentColor. It also provides a single Action to update set the accentColor. The provider and consumer are exported.

```ts
import { createState } from '@phnq/state';

// This is the schema for the data store.
interface State {
  accentColor: string;
}

// This is the API interface for the actions.
interface Actions {
  setAccentColor(accentColor: string): void;
}

// This is a convenience type for consumers.
export type UIStateProps = State & Actions;

/**
 * Create the state and export the provider and consumer.
 * The createState() function takes 3 arguments:
 * 1) An app-unique domain.
 * 2) The initial state of the data store.
 * 3) A function that returns the actions API.
 */
export default createState<State, Actions>(
  'UI',
  {
    accentColor: "blue",
  },
  ({ setState }) => ({
    setAccentColor(accentColor: string) {
      setState({ accentColor });
    },
  }),
);
```

#### Box.tsx

This Box component is a consumer of the UIState declared above. Notice how the `UIStateProps` convenience type is used to specify the incoming state interface. This component just adds a border around the incoming children node(s). The border color comes from the UIState.

```tsx
import React, { FC } from 'react';
import UIState, { UIStateProps } from './UIState';

const Box:FC<UIStateProps> = ({ accentColor, children }) => (
  <div style={{ border: `1px solid ${accentColor}` }}>{children}</div>
);

export default  UIState.consumer(Box);
```

We haven't added a provider yet though. If the Box component were rendered without it's corresponding provider as an ancestor, an error would be thrown with the message:

    No provider found for "UI" state.

#### Container.tsx

This Container component is wrapped by the UIState provider which allows descendents to be UIState consumers.

```tsx
import React, { FC } from 'react';
import UIState from './UIState';
import Box from './Box';

const Container:FC = () => (
  <div>
    <Box>I am in a box</Box>
  </div>
);

export default  UIState.provider(Container);
```

#### ChangeAccentColor.tsx

Here's an example of component that invokes an action. It's a button that, when clicked sets the UIState's accentColor to the color passed in as a prop.

```tsx
import React, { FC } from 'react';
import UIState, { UIStateProps } from './UIState';

interface Props {
  color: string;
}

const ChangeAccentColor:FC<UIStateProps> = ({ color, setAccentColor }) => (
  <button onClick={() => setAccentColor(color)}>
    Make accent color {color}
  </button>
);

export default  UIState.consumer(ChangeAccentColor);
```


#### Container.tsx (updated to include ChangeAccentColor)

This is the same Container component from above, but now it has a few buttons for changing the accent color.

```tsx
import React, { FC } from 'react';
import UIState from './UIState';
import Box from './Box';
import ChangeAccentColor from './ChangeAccentColor';

const Container:FC = () => (
  <div>
    <Box>I am in a box</Box>
    <ChangeAccentColor color="yellow" />
    <ChangeAccentColor color="green" />
    <ChangeAccentColor color="red" />
    <ChangeAccentColor color="blue" />
  </div>
);

export default  UIState.provider(Container);
```
