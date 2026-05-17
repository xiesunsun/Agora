import type { Bullet } from "../types/blackboard";

export type PositionedBullet = Bullet & {
  railOffsetX: number;
};
