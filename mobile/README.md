# Tijuca Flow Mobile

Aplicativo React Native (Expo SDK 54) para o Tijuca Flow.

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar a URL da API

A URL da API é lida de `EXPO_PUBLIC_API_BASE_URL`.

**Emulador Android** (padrão — funciona sem alterar nada):
```
http://10.0.2.2:3000/api/v1
```
`10.0.2.2` é o alias do emulador Android que aponta para o `localhost` da máquina host.

**Dispositivo físico** (ou emulador iOS):
- Descubra o IP da sua máquina na rede local: `ipconfig` (Windows) ou `ifconfig` (Linux/Mac)
- Crie um `.env` a partir do `.env.example` e informe o IP da API.
- Certifique-se de que o dispositivo e a máquina estão **no mesmo WiFi**.

Exemplo:
```bash
cp .env.example .env
# Edite .env com o IP correto
```

### 3. Iniciar o servidor de desenvolvimento

```bash
npx expo start
```

Para abrir no emulador Android (via Expo Go):
```bash
npx expo start --android
```

Se o emulador não conseguir se conectar ao Metro, rode no terminal:
```bash
adb reverse tcp:8081 tcp:8081
```

## Testando em dispositivo físico

- O dispositivo e a máquina devem estar **no mesmo WiFi**
- Use o **IP local da máquina** (não `localhost` nem `10.0.2.2`)
- Com Expo Go: escaneie o QR code — o bundle é servido pela rede local
- Push notifications **só funcionam em dispositivo físico** (não em emulador)

## Push Notifications

Push notifications requerem:
1. **Dispositivo físico** — emuladores não suportam push
2. **EAS projectId** — configure executando:
   ```bash
   npm install -g eas-cli
   eas login
   eas init
   ```
   O `eas init` preenche o `projectId` em `app.json` automaticamente.

Sem `projectId`, o app registra um aviso no console e desabilita push silenciosamente — nenhuma funcionalidade é quebrada.

No **Android** o push passa pelo Firebase (FCM), configurado desde a 1.2.1:

- `google-services.json` (projeto Firebase `tijuca-flow`, app `com.tijuca.flow`) fica na raiz de `mobile/` e é referenciado em `android.googleServicesFile` no `app.json`. Só tem identificadores públicos.
- A chave da conta de serviço do Firebase (FCM V1) está cadastrada na Expo (projeto `tijuca-flow`, `eas credentials -p android` → Google Service Account). Ela é segredo: não vai para o repositório.
- Como `android/` não é versionado e não se roda `prebuild`, o nativo foi ajustado à mão: `google-services.json` copiado para `android/app/`, `classpath('com.google.gms:google-services:4.4.1')` em `android/build.gradle` e `apply plugin: 'com.google.gms.google-services'` no fim de `android/app/build.gradle`. Ao recriar `android/`, refaça (ou rode o prebuild, que aplica o `googleServicesFile`).
- O backend manda no canal `default` ("Tijuca Flow", importância máxima, criado pelo app) com prioridade alta, para aparecer como banner. Com o "Não perturbar" ligado no aparelho o banner não aparece, só a gaveta.

## Estrutura do código

| Pasta | O que tem |
|---|---|
| `src/ui/` | Sistema visual: tokens (`theme.ts`, paletas clara e escura), botões, cards, campos, folhas inferiores, avisos curtos. |
| `src/domain/` | Regras espelhadas do web: caminho das seções do formulário, pedido de itens, travas de fase, permissões, formatação das respostas, arquivos (download com login). |
| `src/fields/` | Campos de formulário e de fase (um componente para os dois). |
| `src/api/` | Chamadas (`endpoints.ts`), cache e invalidação (`queries.ts`), tipos. |
| `src/screens/` | Telas; o card fica em `screens/card/` (Fase, Respostas, Atividade, Arquivos). |

Tema claro/escuro: o app segue o modo escuro do celular, e a pessoa pode fixar claro ou escuro em Perfil → Aparência. Cor nunca vai fixa no componente: use `const { colors } = useTheme()` e, para folhas de estilo com cor, `const useStyles = makeStyles((colors) => StyleSheet.create({ ... }))`. Azul da marca como texto ou ícone é `colors.brandText`; como fundo, `colors.brand`.

As regras em `src/domain/` são cópias das do web (`frontend/src/modules/**`) e do backend: mudou lá, muda aqui.

## Build de produção

O script usa a API HTTPS oficial, gera uma chave release na primeira execução e protege sua senha com o DPAPI do Windows.

```bash
# APK instalável localmente (Windows)
.\scripts\build-production-apk.ps1

# EAS / lojas
eas build --platform android
```

O APK local é gerado em `android/app/build/outputs/apk/release/app-release.apk`.

Para publicar na Google Play, gere preferencialmente um Android App Bundle (`bundleRelease`/`.aab`).
