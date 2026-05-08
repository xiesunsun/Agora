import type { Bullet } from "../types/blackboard";

export interface PositionedBullet extends Bullet {
  railOffsetX: number;
}
