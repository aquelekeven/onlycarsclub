import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://onlycarsclub.com.br";

const apparelWeights: Record<string, number> = {
  "moletom": 600,
  "camiseta-oversized": 320,
  "camiseta-oversized-amarela": 320,
  "camiseta-streetwear": 250,
  "cropped": 200,
};

const accessorySlugs = new Set([
  "chaveiro-logotipo",
  "chaveiro-onlynho-1",
  "chaveiro-onlynho-2",
  "adesivo-japones-p",
  "adesivo-japones-m",
  "adesivo-japones-g",
  "adesivo-mascote",
]);

const allowedDeliveryMethods = new Set([
  "shipping",
  "event_pickup",
]);

const allowedOrigins = new Set([
  SITE_URL,
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const getCorsHeaders = (request: Request) => {
  const origin = request.headers.get("origin") || SITE_URL;

  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : SITE_URL,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const jsonResponse = (
  request: Request,
  body: unknown,
  status = 200,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/json",
    },
  });

const validUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: getCorsHeaders(request),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, {
      error: "Método não permitido.",
    }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mercadoPagoToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !mercadoPagoToken) {
    console.error("Configuração obrigatória ausente.");
    return jsonResponse(request, {
      error: "Checkout temporariamente indisponível.",
    }, 500);
  }

  const authorization = request.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(request, {
      error: "Faça login para continuar.",
    }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse(request, {
      error: "Sua sessão expirou. Entre novamente.",
    }, 401);
  }

  try {
    const payload = await request.json();

    const checkoutKey = String(payload?.checkout_key || "");
    const deliveryMethod = String(payload?.delivery_method || "");
    const selectedServiceId = String(
      payload?.shipping_quote?.service_id || "",
    );

    if (!validUuid(checkoutKey)) {
      throw new Error("Identificador do checkout inválido.");
    }

    if (!allowedDeliveryMethods.has(deliveryMethod)) {
      throw new Error("Forma de entrega inválida.");
    }

    if (!Array.isArray(payload?.items) || payload.items.length === 0) {
      throw new Error("Carrinho vazio.");
    }

    if (payload.items.length > 30) {
      throw new Error("Quantidade de itens acima do permitido.");
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("display_name, phone, tax_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Não foi possível carregar os dados do cliente.");
    }

    let address: Record<string, any> | null = null;
    const requestedAddressId = String(payload?.address_id || "");
    if (deliveryMethod === "shipping" && requestedAddressId) {
      if (!validUuid(requestedAddressId)) throw new Error("Endereço inválido.");
      const { data, error } = await serviceClient.from("addresses")
        .select("recipient_name, postal_code, street, number, complement, neighborhood, city, state")
        .eq("id", requestedAddressId).eq("user_id", user.id).maybeSingle();
      if (error || !data) throw new Error("Endereço salvo não encontrado.");
      address = data;
    } else if (deliveryMethod === "shipping") {
      const raw = payload?.shipping_address || {};
      address = {
        recipient_name:String(raw.recipient_name || "").trim(),
        postal_code:String(raw.postal_code || "").replace(/\D/g, ""),
        street:String(raw.street || "").trim(), number:String(raw.number || "").trim(),
        complement:String(raw.complement || "").trim() || null,
        neighborhood:String(raw.neighborhood || "").trim(), city:String(raw.city || "").trim(),
        state:String(raw.state || "").trim().toUpperCase(),
      };
      if (!address.recipient_name || address.postal_code.length !== 8 || !address.street ||
        !address.number || !address.neighborhood || !address.city || !/^[A-Z]{2}$/.test(address.state)) {
        throw new Error("Preencha o endereço de entrega completo.");
      }
    }

    const customerName = String(
      address?.recipient_name ||
        profile.display_name ||
        "",
    ).trim();

    const customerPhone = String(profile.phone || "")
      .replace(/\D/g, "");

    const customerTaxId = String(profile.tax_id || "")
      .replace(/\D/g, "");

    if (!customerName) {
      throw new Error("Informe o nome completo na etapa de entrega.");
    }

    if (![10, 11].includes(customerPhone.length)) {
      throw new Error("Informe um telefone válido na etapa de entrega.");
    }

    if (deliveryMethod === "shipping") {
      if (!address) {
        throw new Error("Salve um endereço antes de calcular o frete.");
      }

      if (customerTaxId.length !== 11) {
        throw new Error("Informe o CPF para realizar o envio.");
      }

      if (!selectedServiceId) {
        throw new Error("Selecione uma transportadora.");
      }
    }

    const canonicalItems = [];
    let subtotalCents = 0;
    let totalQuantity = 0;
    let weightGrams = 0;
    let hasApparel = false;

    for (const rawItem of payload.items) {
      const productSlug = String(rawItem?.product_slug || "");
      const size = String(rawItem?.size || "");
      const color = String(rawItem?.color || "");
      const quantity = Math.trunc(Number(rawItem?.quantity || 0));
      const gift = String(rawItem?.gift || "").trim();

      if (!productSlug || quantity < 1 || quantity > 99) {
        throw new Error("Existe um item inválido no carrinho.");
      }

      const { data: product, error: productError } = await serviceClient
        .from("products")
        .select("id, slug, name, active, metadata")
        .eq("slug", productSlug)
        .eq("active", true)
        .single();

      if (productError || !product) {
        throw new Error(`Produto indisponível: ${productSlug}.`);
      }

      let variantQuery = serviceClient
        .from("product_variants")
        .select(
          "id, sku, size, color, price_cents, stock_quantity, reserved_quantity, active",
        )
        .eq("product_id", product.id)
        .eq("active", true);

      variantQuery = size
        ? variantQuery.eq("size", size)
        : variantQuery.is("size", null);

      variantQuery = color
        ? variantQuery.eq("color", color)
        : variantQuery.is("color", null);

      const { data: variant, error: variantError } =
        await variantQuery.single();

      if (variantError || !variant) {
        throw new Error(`Variação indisponível para ${product.name}.`);
      }

      const availableStock =
        Number(variant.stock_quantity) -
        Number(variant.reserved_quantity);

      const allowBackorder =
  product.metadata?.allow_backorder === true;

if (availableStock < quantity && !allowBackorder) {
  throw new Error(`Estoque insuficiente para ${product.name}.`);
}

      subtotalCents += Number(variant.price_cents) * quantity;
      totalQuantity += quantity;

      if (apparelWeights[productSlug]) {
        hasApparel = true;
        weightGrams += apparelWeights[productSlug] * quantity;
      } else if (
        deliveryMethod === "shipping" &&
        !accessorySlugs.has(productSlug)
      ) {
        throw new Error(
          `${product.name} ainda não possui peso e embalagem configurados para envio.`,
        );
      }

      canonicalItems.push({
        product_slug: productSlug,
        name: product.name,
        size: variant.size,
        color: variant.color,
        quantity,
        gift: gift || null,
        unit_price_cents: Number(variant.price_cents),
      });
    }

    let shippingCents = 0;
    let canonicalShippingQuote = null;
    let shippingAddress = null;

    if (deliveryMethod === "shipping") {
      if (!hasApparel || weightGrams <= 0) {
        throw new Error(
          "Chaveiros e adesivos precisam estar acompanhados de uma camiseta ou moletom para envio.",
        );
      }

      const dimensions = totalQuantity === 1
        ? { length: 30, width: 20, height: 8 }
        : { length: 70, width: 50, height: 8 };

      const quoteResponse = await fetch(
        `${supabaseUrl}/functions/v1/melhor-envio-cotacao`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to_postal_code: address.postal_code,
            package: {
              ...dimensions,
              weight: weightGrams / 1000,
              insurance_value: Number(
                (subtotalCents / 100).toFixed(2),
              ),
            },
          }),
        },
      );

      const quoteData = await quoteResponse.json();

      if (!quoteResponse.ok) {
        throw new Error(
          quoteData?.error ||
            "Não foi possível validar o frete.",
        );
      }

      const quotes = Array.isArray(quoteData?.quotes)
        ? quoteData.quotes
        : [];

      const selectedQuote = quotes.find((quote: Record<string, unknown>) =>
        String(quote?.id) === selectedServiceId &&
        !quote?.error
      );

      if (!selectedQuote) {
        throw new Error(
          "A cotação selecionada expirou. Calcule o frete novamente.",
        );
      }

      const shippingPrice = Number(
        selectedQuote.custom_price ?? selectedQuote.price,
      );

      if (!Number.isFinite(shippingPrice) || shippingPrice < 0) {
        throw new Error("Valor de frete inválido.");
      }

      const deliveryTime = Number(
        selectedQuote.custom_delivery_time ??
          selectedQuote.delivery_time,
      );

      const serviceName = String(
        selectedQuote.name || "Transportadora",
      );

      const companyName = String(
        selectedQuote.company?.name || "",
      );

      shippingCents = Math.round(shippingPrice * 100);

      canonicalShippingQuote = {
        service_id: selectedQuote.id,
        service_name: serviceName,
        company_name: companyName,
        price_cents: shippingCents,
        delivery_days: Number.isFinite(deliveryTime)
          ? deliveryTime
          : null,
        postal_code: address.postal_code,
        package: {
          ...dimensions,
          weight_grams: weightGrams,
        },
      };

      shippingAddress = {
        recipient_name: address.recipient_name,
        postal_code: address.postal_code,
        street: address.street,
        number: address.number,
        complement: address.complement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
      };
    }

    const { data: orderResult, error: orderError } =
      await serviceClient.rpc("create_checkout_order", {
        p_checkout_key: checkoutKey,
        p_user_id: user.id,
        p_customer_email: user.email,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_customer_tax_id: customerTaxId || null,
        p_delivery_method: deliveryMethod,
        p_shipping_address: shippingAddress,
        p_shipping_quote: canonicalShippingQuote,
        p_shipping_cents: shippingCents,
        p_items: canonicalItems,
      });

    if (orderError) {
      throw new Error(orderError.message);
    }

    const orderId = String(orderResult.order_id);
    const orderNumber = String(orderResult.order_number);
    const totalCents = Number(orderResult.total_cents);

    const { data: existingPayment } = await serviceClient
      .from("payments")
      .select("id, provider_preference_id")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existingPayment?.provider_preference_id) {
      const existingPreferenceResponse = await fetch(
        `https://api.mercadopago.com/checkout/preferences/${
          encodeURIComponent(existingPayment.provider_preference_id)
        }`,
        {
          headers: {
            Authorization: `Bearer ${mercadoPagoToken}`,
            Accept: "application/json",
          },
        },
      );

      if (existingPreferenceResponse.ok) {
        const existingPreference =
          await existingPreferenceResponse.json();

        return jsonResponse(request, {
          order_id: orderId,
          order_number: orderNumber,
          checkout_url:
            existingPreference.sandbox_init_point ||
            existingPreference.init_point,
          reused: true,
        });
      }
    }

    const payerNameParts = customerName.split(/\s+/);
    const payerFirstName = payerNameParts.shift() || customerName;
    const payerLastName = payerNameParts.join(" ");

    const preferenceItems = canonicalItems.map((item) => ({
      id: `${item.product_slug}-${item.size}-${item.color}`,
      // O Mercado Pago pode agrupar visualmente itens com o mesmo título.
      // Incluir a variação impede que P e M apareçam como uma única linha.
      title: [
        item.name,
        item.size ? `Tam. ${item.size}` : "",
        item.color || "",
      ].filter(Boolean).join(" · "),
      description: [
        item.gift ? `Brinde: ${item.gift}` : "",
      ].filter(Boolean).join(" · "),
      quantity: item.quantity,
      currency_id: "BRL",
      unit_price: Number(
        (item.unit_price_cents / 100).toFixed(2),
      ),
    }));

    if (shippingCents > 0) {
      preferenceItems.push({
        id: `frete-${canonicalShippingQuote?.service_id || "envio"}`,
        title: `Frete · ${canonicalShippingQuote?.service_name || "Entrega"}`,
        description: canonicalShippingQuote?.company_name || "Envio para o endereço",
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number((shippingCents / 100).toFixed(2)),
      });
    }

    const preferenceBody = {
      items: preferenceItems,
      payer: {
        email: user.email,
        name: payerFirstName,
        surname: payerLastName,
        identification: customerTaxId
          ? {
              type: "CPF",
              number: customerTaxId,
            }
          : undefined,
      },
      external_reference: orderId,
      notification_url:
        `${supabaseUrl}/functions/v1/mercado-pago-webhook`,
      back_urls: {
        success:
          `${SITE_URL}/pagamento.html?status=success&order=${orderId}`,
        pending:
          `${SITE_URL}/pagamento.html?status=pending&order=${orderId}`,
        failure:
          `${SITE_URL}/pagamento.html?status=failure&order=${orderId}`,
      },
      auto_return: "approved",
      binary_mode: false,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(
        Date.now() + 30 * 60 * 1000,
      ).toISOString(),
      statement_descriptor: "ONLY CARS CLUB",
      metadata: {
        order_id: orderId,
        order_number: orderNumber,
      },
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" },
          { id: "atm" },
        ],
      },
    };

    const preferenceResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mercadoPagoToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": checkoutKey,
        },
        body: JSON.stringify(preferenceBody),
      },
    );

    const preference = await preferenceResponse.json();

    if (!preferenceResponse.ok) {
      console.error("Erro ao criar preferência:", preference);

      throw new Error(
        preference?.message ||
          "O Mercado Pago não conseguiu iniciar o pagamento.",
      );
    }

    const { error: paymentUpdateError } = await serviceClient
      .from("payments")
      .update({
        provider_preference_id: String(preference.id),
        amount_cents: totalCents,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    if (paymentUpdateError) {
      throw new Error(paymentUpdateError.message);
    }

    return jsonResponse(request, {
      order_id: orderId,
      order_number: orderNumber,
      checkout_url:
        preference.sandbox_init_point ||
        preference.init_point,
      reused: false,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Não foi possível iniciar o pagamento.";

    console.error("Erro no checkout:", message);

    return jsonResponse(request, {
      error: message,
    }, 400);
  }
});
