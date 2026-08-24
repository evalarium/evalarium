export interface Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priceCents: number;
}

export interface CartItem {
  readonly productId: string;
  readonly quantity: number;
}

export interface Order {
  readonly orderId: string;
  readonly createdAt: number;
}
