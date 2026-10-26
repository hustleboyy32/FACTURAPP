# FacturApp

Editor y generador de facturas en el navegador. No necesita servidor ni instalación: es un
único `index.html` con su CSS y JS.

## Cómo usarla

1. Abrí `index.html` en el navegador (doble clic alcanza).
2. Completá los datos en el panel de la izquierda. Todo se guarda solo en el navegador
   (localStorage), así que al volver a abrirla los datos del negocio siguen ahí.
3. En **Copias a generar** elegí si además del ORIGINAL querés DUPLICADO y/o TRIPLICADO:
   cada copia sale como una página más del mismo PDF, con su etiqueta arriba. La vista previa
   tiene un selector para ver cada copia.
4. Tocá **Generar PDF** y en el diálogo de impresión elegí *Guardar como PDF*.
5. **Nueva factura** pasa al número de comprobante siguiente y limpia cliente y productos.

## Qué se puede editar

**Datos del negocio**: logo (se convierte a blanco y negro al subirlo y reemplaza al nombre
comercial en la cabecera de la factura; el nombre sigue saliendo al pie), nombre comercial, razón social, domicilio comercial, CUIT, punto de venta
(por defecto `00001`), número de comprobante (arranca en `00000001`) y, en *Otros datos*,
condición frente al IVA (por defecto IVA Responsable Inscripto), ingresos brutos, inicio de actividades y referencia comercial.
La fecha de emisión es siempre la del día y no se puede cambiar.
El CUIT se controla al escribirlo: tienen que ser 11 dígitos y el verificador tiene que cerrar.
Con IVA Responsable Inscripto, el IVA contenido se calcula al 21 % sobre el precio final (`total × 21 / 121`).

**Cliente** (consumidor final): CUIT, apellido y nombre / razón social, domicilio y condición de venta.

**Productos**: producto/servicio, cantidad y precio unitario. El subtotal se calcula solo
(cantidad × precio) y cada fila recibe un código alfanumérico aleatorio en mayúsculas.

## Nota

El pie repite el de ARCA: el mismo código QR del comprobante, el logo, «Comprobante
Autorizado» y el CAE. El CAE y su vencimiento se cargan a mano.

## Estructura

```
index.html   estructura del panel de edición y de la factura
styles.css   estilos de pantalla e impresión (A4)
app.js       estado, cálculos, numeración y vista previa
```
