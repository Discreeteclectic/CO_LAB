const fs = require('fs').promises;
const path = require('path');

// Contract templates for different types
const contractTemplates = {
  SUPPLY: {
    name: 'Договор поставки',
    template: `
ДОГОВОР ПОСТАВКИ № {contractNumber}

г. {city}, {contractDate}

{sellingCompany}, именуемое в дальнейшем "Поставщик", в лице {representativeName}, 
действующего на основании {representativeBasis}, с одной стороны, 

и

{clientName}, ИНН {clientINN}, именуемое в дальнейшем "Покупатель", 
в лице {clientRepresentative}, действующего на основании {clientBasis}, с другой стороны,

заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА
1.1. Поставщик обязуется поставить товары согласно спецификации (Приложение 1), 
а Покупатель принять и оплатить их в порядке и на условиях, предусмотренных настоящим Договором.

1.2. Общая стоимость поставки составляет {totalAmount} рублей, включая НДС.

2. УСЛОВИЯ ПОСТАВКИ
2.1. Поставка товаров осуществляется по адресу: {deliveryAddress}
2.2. Срок поставки: с {validFrom} по {validTo}

{#if exchangeName}
2.3. Поставка осуществляется через биржу: {exchangeName} ({exchangeType})
{/if}

3. ПОРЯДОК РАСЧЕТОВ
3.1. Общая стоимость товаров по настоящему Договору составляет {totalAmount} рублей.
3.2. Оплата производится в течение {paymentTerms} дней с момента поставки товаров.

4. ОТВЕТСТВЕННОСТЬ СТОРОН
4.1. За невыполнение или ненадлежащее выполнение обязательств по настоящему Договору 
стороны несут ответственность в соответствии с действующим законодательством РФ.

5. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ
5.1. Настоящий Договор вступает в силу с {validFrom} и действует до {validTo}.
{#if autoRenewal}
5.2. При отсутствии заявлений о расторжении Договор автоматически продлевается на тот же срок.
{/if}

5.3. Все изменения и дополнения к Договору действительны лишь при условии, 
что они совершены в письменной форме и подписаны обеими сторонами.

{terms}

{conditions}

ПОДПИСИ СТОРОН:

Поставщик:                           Покупатель:
{sellingCompany}                     {clientName}

_________________                    _________________
Подпись                             Подпись

М.П.                                М.П.
    `,
    variables: [
      'contractNumber', 'city', 'contractDate', 'sellingCompany', 'representativeName', 
      'representativeBasis', 'clientName', 'clientINN', 'clientRepresentative', 
      'clientBasis', 'totalAmount', 'deliveryAddress', 'validFrom', 'validTo', 
      'exchangeName', 'exchangeType', 'paymentTerms', 'autoRenewal', 'terms', 'conditions'
    ]
  },
  
  SERVICE: {
    name: 'Договор оказания услуг',
    template: `
ДОГОВОР НА ОКАЗАНИЕ УСЛУГ № {contractNumber}

г. {city}, {contractDate}

{sellingCompany}, именуемое в дальнейшем "Исполнитель", в лице {representativeName}, 
действующего на основании {representativeBasis}, с одной стороны, 

и

{clientName}, ИНН {clientINN}, именуемое в дальнейшем "Заказчик", 
в лице {clientRepresentative}, действующего на основании {clientBasis}, с другой стороны,

заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА
1.1. Исполнитель обязуется оказать услуги, указанные в Техническом задании (Приложение 1), 
а Заказчик принять и оплатить их.

1.2. Общая стоимость услуг составляет {totalAmount} рублей, включая НДС.

2. СРОКИ ВЫПОЛНЕНИЯ
2.1. Услуги оказываются с {validFrom} по {validTo}

3. ПОРЯДОК РАСЧЕТОВ
3.1. Общая стоимость услуг по настоящему Договору составляет {totalAmount} рублей.
3.2. Оплата производится согласно календарному плану платежей.

{terms}

{conditions}

ПОДПИСИ СТОРОН:

Исполнитель:                         Заказчик:
{sellingCompany}                     {clientName}

_________________                    _________________
Подпись                             Подпись
    `,
    variables: [
      'contractNumber', 'city', 'contractDate', 'sellingCompany', 'representativeName', 
      'representativeBasis', 'clientName', 'clientINN', 'clientRepresentative', 
      'clientBasis', 'totalAmount', 'validFrom', 'validTo', 'terms', 'conditions'
    ]
  },

  LEASE: {
    name: 'Договор аренды',
    template: `
ДОГОВОР АРЕНДЫ № {contractNumber}

г. {city}, {contractDate}

{sellingCompany}, именуемое в дальнейшем "Арендодатель", в лице {representativeName}, 
действующего на основании {representativeBasis}, с одной стороны, 

и

{clientName}, ИНН {clientINN}, именуемое в дальнейшем "Арендатор", 
в лице {clientRepresentative}, действующего на основании {clientBasis}, с другой стороны,

заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА
1.1. Арендодатель предоставляет во временное владение и пользование оборудование/имущество, 
указанное в Приложении 1.

1.2. Размер арендной платы составляет {totalAmount} рублей за период аренды.

2. СРОК АРЕНДЫ
2.1. Договор действует с {validFrom} по {validTo}

{#if autoRenewal}
2.2. При отсутствии заявлений о расторжении Договор автоматически продлевается.
{/if}

{terms}

{conditions}

ПОДПИСИ СТОРОН:

Арендодатель:                        Арендатор:
{sellingCompany}                     {clientName}

_________________                    _________________
Подпись                             Подпись
    `,
    variables: [
      'contractNumber', 'city', 'contractDate', 'sellingCompany', 'representativeName', 
      'representativeBasis', 'clientName', 'clientINN', 'clientRepresentative', 
      'clientBasis', 'totalAmount', 'validFrom', 'validTo', 'autoRenewal', 'terms', 'conditions'
    ]
  },

  PURCHASE: {
    name: 'Договор купли-продажи',
    template: `
ДОГОВОР КУПЛИ-ПРОДАЖИ № {contractNumber}

г. {city}, {contractDate}

{sellingCompany}, именуемое в дальнейшем "Продавец", в лице {representativeName}, 
действующего на основании {representativeBasis}, с одной стороны, 

и

{clientName}, ИНН {clientINN}, именуемое в дальнейшем "Покупатель", 
в лице {clientRepresentative}, действующего на основании {clientBasis}, с другой стороны,

заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА
1.1. Продавец обязуется передать в собственность товары, указанные в Приложении 1,
а Покупатель принять и оплатить их.

1.2. Общая стоимость товаров составляет {totalAmount} рублей.

2. ПЕРЕХОД ПРАВА СОБСТВЕННОСТИ
2.1. Право собственности на товар переходит к Покупателю с момента его полной оплаты.

{#if exchangeName}
2.2. Сделка осуществляется через биржу: {exchangeName} ({exchangeType})
{/if}

{terms}

{conditions}

ПОДПИСИ СТОРОН:

Продавец:                            Покупатель:
{sellingCompany}                     {clientName}

_________________                    _________________
Подпись                             Подпись
    `,
    variables: [
      'contractNumber', 'city', 'contractDate', 'sellingCompany', 'representativeName', 
      'representativeBasis', 'clientName', 'clientINN', 'clientRepresentative', 
      'clientBasis', 'totalAmount', 'exchangeName', 'exchangeType', 'terms', 'conditions'
    ]
  },

  EXCHANGE: {
    name: 'Биржевой договор',
    template: `
БИРЖЕВОЙ ДОГОВОР № {contractNumber}

г. {city}, {contractDate}

{sellingCompany}, именуемое в дальнейшем "Продавец", с одной стороны, 

и

{clientName}, ИНН {clientINN}, именуемое в дальнейшем "Покупатель", с другой стороны,

при участии {exchangeName} ({exchangeType}), заключили настоящий Договор:

1. ПРЕДМЕТ ДОГОВОРА
1.1. Продавец обязуется поставить, а Покупатель принять и оплатить товары 
в соответствии с биржевым контрактом.

1.2. Биржа: {exchangeName}
1.3. Тип биржи: {exchangeType}
1.4. Стоимость контракта: {totalAmount} рублей

2. БИРЖЕВЫЕ УСЛОВИЯ
2.1. Исполнение договора осуществляется в соответствии с правилами биржи {exchangeName}
2.2. Расчеты производятся через биржевую систему

{terms}

{conditions}

ПОДПИСИ СТОРОН:

Продавец:                            Покупатель:
{sellingCompany}                     {clientName}

_________________                    _________________
Подпись                             Подпись

Биржа: {exchangeName}
    `,
    variables: [
      'contractNumber', 'city', 'contractDate', 'sellingCompany', 'clientName', 'clientINN',
      'totalAmount', 'exchangeName', 'exchangeType', 'terms', 'conditions'
    ]
  }
};

/**
 * Get available contract templates
 */
function getAvailableTemplates() {
  return Object.keys(contractTemplates).map(key => ({
    type: key,
    name: contractTemplates[key].name,
    variables: contractTemplates[key].variables
  }));
}

/**
 * Get contract template by type
 */
function getTemplate(contractType) {
  return contractTemplates[contractType] || contractTemplates.SUPPLY;
}

/**
 * Simple template engine - replace variables with values
 */
function renderTemplate(template, variables) {
  let rendered = template;
  
  // Replace simple variables {variableName}
  for (const [key, value] of Object.entries(variables)) {
    if (value !== null && value !== undefined) {
      const regex = new RegExp(`{${key}}`, 'g');
      rendered = rendered.replace(regex, value);
    }
  }
  
  // Handle conditional blocks {#if variable}...{/if}
  rendered = rendered.replace(/{#if\s+(\w+)}(.*?){\/if}/gs, (match, variable, content) => {
    return variables[variable] ? content : '';
  });
  
  // Clean up remaining empty variables
  rendered = rendered.replace(/{[\w]+}/g, '');
  
  return rendered.trim();
}

/**
 * Generate contract from template
 */
function generateContract(contractType, contractData, clientData, orderData = null) {
  const template = getTemplate(contractType);
  
  // Prepare template variables
  const templateVariables = {
    // Contract data
    contractNumber: contractData.contractNumber,
    contractDate: contractData.contractDate ? new Date(contractData.contractDate).toLocaleDateString('ru-RU') : '',
    totalAmount: contractData.totalAmount ? contractData.totalAmount.toLocaleString('ru-RU') : '0',
    currency: contractData.currency || 'RUB',
    description: contractData.description || '',
    terms: contractData.terms || '',
    conditions: contractData.conditions || '',
    exchangeName: contractData.exchangeName || '',
    exchangeType: contractData.exchangeType || '',
    validFrom: contractData.validFrom ? new Date(contractData.validFrom).toLocaleDateString('ru-RU') : '',
    validTo: contractData.validTo ? new Date(contractData.validTo).toLocaleDateString('ru-RU') : '',
    autoRenewal: contractData.autoRenewal || false,
    
    // Client data
    clientName: clientData.name || '',
    clientINN: clientData.inn || '',
    clientRepresentative: clientData.contactPerson || '',
    clientBasis: 'Устава', // Default value
    deliveryAddress: clientData.address || '',
    
    // Company data (can be configured)
    sellingCompany: getSellingCompanyName(contractData.sellingCompany),
    representativeName: 'Директора', // Default
    representativeBasis: 'Устава', // Default
    city: 'Москва', // Default
    
    // Order data if provided
    orderNumber: orderData?.number || '',
    orderDate: orderData?.orderDate ? new Date(orderData.orderDate).toLocaleDateString('ru-RU') : '',
    
    // Default terms
    paymentTerms: '10'
  };
  
  return renderTemplate(template.template, templateVariables);
}

/**
 * Get company name based on selling company code
 */
function getSellingCompanyName(companyCode) {
  const companies = {
    'NOVA': 'ООО "НОВА"',
    'CO-LAB': 'ООО "СО-ЛАБ"',
    'COLAB': 'ООО "СО-ЛАБ"'
  };
  
  return companies[companyCode] || companies['CO-LAB'];
}

/**
 * Save contract to file system (for PDF generation later)
 */
async function saveContractToFile(contractId, content) {
  try {
    const contractsDir = path.join(__dirname, '../../contracts');
    
    // Ensure directory exists
    try {
      await fs.access(contractsDir);
    } catch {
      await fs.mkdir(contractsDir, { recursive: true });
    }
    
    const filePath = path.join(contractsDir, `${contractId}.txt`);
    await fs.writeFile(filePath, content, 'utf8');
    
    return filePath;
  } catch (error) {
    throw new Error(`Failed to save contract: ${error.message}`);
  }
}

/**
 * Load contract from file system
 */
async function loadContractFromFile(contractId) {
  try {
    const filePath = path.join(__dirname, '../../contracts', `${contractId}.txt`);
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    throw new Error(`Failed to load contract: ${error.message}`);
  }
}

module.exports = {
  getAvailableTemplates,
  getTemplate,
  generateContract,
  renderTemplate,
  saveContractToFile,
  loadContractFromFile
};