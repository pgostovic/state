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

Go straight to some [code examples](#examples).

### Providers and Consumers

State `providers` and `consumers` are React higher-order components (HOCs) that provide state-related functionality to the components that they wrap.

#### Provider
A `provider` represents a domain-specific data store and provides a programmatic API for manipulating the store's data. A provider's scope is the component sub-hierarchy that it wraps.

#### Consumer
A `consumer` brokers access to its corresponding state provider, i.e. its closest same-domain provider ancestor. Access to the data store's data and its API are provided to the wrapped component via props.

The `createState` function in `@phnq/state` is used to create create a matching domain-specific provider and consumer. It returns a JavaScript object with the keys 'provider' and 'consumer'.

### State and Actions
Inspired by Redux's nomenclature, the data in a provider's data store is referred to as `State`, and the programmatic API is said to be composed of `Actions` -- i.e. each function in the API is an `Action`.

Actions are logically and semantically decoupled from the results they yield. In other words, invoking an action can be thought of as a one-way message or instruction for the data store. Any resulting state changes will materialize as prop changes in state consumers. As such, action functions may only return `void` or `Promise<void>`. This one-way communication restriction makes state management with `@phnq/state` akin to pub/sub.

## Examples

#### UIState.ts
This trivial example creates a data store that has a single value, accentColor. It also provides a single Action to update the accentColor. The provider and consumer, which are returned from `createState`, are exported.

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
 * The createState() function takes 4 arguments:
 * 1) An app-unique domain.
 * 2) The initial state of the data store.
 * 3) A function that returns the actions API.
 * 4) (optional) a Provider mapping function - discussed below.
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

#### Box.tsx (consumer)

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

#### Container.tsx (provider)

This Container component is wrapped by the UIState provider which allows descendents to be UIState consumers. The Box component included here now has a provider as an ancestor.

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

#### ChangeAccentColor.tsx (consumer)

Here's an example of a consumer component that invokes an action. It's a button that, when clicked sets the UIState's accentColor to the color passed in as a prop.

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

This is the same Container component from above, but now it has a few buttons for changing the accent color. Clicking a <ChangeAccentColor /> buttom will update the UIState's accentColor state, which will in-turn trigger consumers to be re-rendered with the new value.

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

## Async Side-Effects
Async side-effects in `@phnq/state` actions are possible by adding `async`. This simple facility is attributed to the one-way nature of actions.

Here's an example of an action that asynchronously updates the state.

```ts
import { createState } from '@phnq/state';
import { Thing, getThings } from 'thing-api';

interface State {
  things: Thing[];
}

interface Actions {
  fetchThings(): Promise<void>;
}

export type ThingStateProps = State & Actions;

export default createState<State, Actions>(
  'Things',
  {
    things: [],
  },
  ({ getState, setState }) => ({
    async fetchThings() {
      const { things } = getState();
      console.log('Old things: ', things);

      // Imagine that getThings() makes a network request or something.
      setState({ things: await getThings() });
    },
  }),
);
```

## Provider Mapping
The fourth (optional) argument to the `createState()` function is the "provider mapping"
function. This function provides an opportunity to wrap the state Provider with
other higher-order components (HOCs) to extend the functionality of action functions.
There is also a corresponding additional type variable to add the HOC's prop types.

For example, suppose you wanted to use localized strings in an action function using
[@phnq/i18n](https://www.npmjs.com/package/@phnq/i18n). The @phnq/i18n provides a
function for retrieving translated strings: `i18ns()`. The `i18ns()` function is
exposed to a React component as a prop via a HOC. Here's how to bring it into a
state action function:

```ts
import { createState } from '@phnq/state';
import { WithI18nProps, withI18n } from '@phnq/i18n'
import { Thing, getThings } from 'thing-api';

interface State {
  things: Thing[];
}

interface Actions {
  fetchThings(): Promise<void>;
}

export type ThingStateProps = State & Actions;

// Add the WithI18nProps type so we can use the i18ns() function.
export default createState<State, Actions, WithI18nProps>(
  'Things',
  {
    things: [],
  },
  ({ setState, i18ns }) => ({
    async fetchThings() {
      try {
        setState({ things: await getThings() });
      } catch (err) {
        alert(i18ns('error.generic', { message: err.message }));
      }
    },
  }),
  Provider => withI18n(Provider), // Wrap the Provider with the withI18n() HOC
);
```
The provider mapping function could be some arbitrary chain of HOCs. In the above
case there's only one, so instead of the last argument being:
```ts
  Provider => withI18n(Provider)
```
It could just be:
```ts
  withI18n
```
