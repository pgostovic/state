import React, { ComponentType, FC } from 'react';

export interface With42Props {
  fortyTwo: number;
}

const with42 = <T extends With42Props = With42Props>(Wrapped: ComponentType<T>) =>
  ((props: T) => <Wrapped {...props} fortyTwo={42} />) as FC<Omit<T, keyof With42Props>>;

export default with42;
