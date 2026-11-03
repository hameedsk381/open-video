import { LOCAL_PRINCIPAL } from '@ove/storage';
import type { Auth } from './types';

/** Local use: whoever can reach the loopback address is the one local person. The host and origin checks keep other web pages out. */
export const loopbackAuth: Auth = { authenticate: async () => LOCAL_PRINCIPAL };
