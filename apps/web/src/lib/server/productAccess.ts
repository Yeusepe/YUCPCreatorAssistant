import { createServerFn } from '@tanstack/react-start';
import type { BuyerProductAccessResponse } from '../productAccessTypes';
import { logWebError } from '../webDiagnostics';
import { serverApiFetch } from './api-client';
import { withWebServerRequestSpan } from './observability';

interface BuyerProductAccessRequest {
  catalogProductId: string;
}

export const fetchBuyerProductAccess = createServerFn({ method: 'GET' })
  .inputValidator((data: BuyerProductAccessRequest) => data)
  .handler(
    async ({ data }: { data: BuyerProductAccessRequest }): Promise<BuyerProductAccessResponse> => {
      return withWebServerRequestSpan(
        'serverFn.product-access.buyer',
        {
          'tanstack.serverfn': 'fetchBuyerProductAccess',
          'buyer.catalog_product_id': data.catalogProductId,
        },
        async () => {
          try {
            return await serverApiFetch<BuyerProductAccessResponse>(
              `/api/connect/user/product-access/${encodeURIComponent(data.catalogProductId)}`
            );
          } catch (error) {
            logWebError('Buyer product access load failed', error, {
              catalogProductId: data.catalogProductId,
            });
            throw error;
          }
        }
      );
    }
  );
