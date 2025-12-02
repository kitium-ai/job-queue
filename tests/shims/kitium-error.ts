export class KitiumError extends Error {
  constructor(shape: { message: string }) {
    super(shape?.message ?? 'KitiumError');
    this.name = 'KitiumError';
  }
}
