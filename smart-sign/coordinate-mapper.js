(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  NS.CoordinateMapper = {
    pdfRectToNormalized(pdfRect, viewport) {
      const vr = viewport.convertToViewportRectangle(pdfRect);
      const left = Math.min(vr[0], vr[2]);
      const right = Math.max(vr[0], vr[2]);
      const top = Math.min(vr[1], vr[3]);
      const bottom = Math.max(vr[1], vr[3]);
      const vw = viewport.width || 1;
      const vh = viewport.height || 1;

      return {
        x: clamp01(left / vw),
        y: clamp01(top / vh),
        width: clamp01((right - left) / vw),
        height: clamp01((bottom - top) / vh),
      };
    },

    pdfPointToNormalized(px, py, viewport) {
      const [vx, vy] = viewport.convertToViewportPoint(px, py);
      return {
        x: vx / (viewport.width || 1),
        y: vy / (viewport.height || 1),
      };
    },

    ocrBoxToNormalized(bbox, imageWidth, imageHeight) {
      const iw = imageWidth || 1;
      const ih = imageHeight || 1;
      const x = clamp01(bbox.x0 / iw);
      const y = clamp01(bbox.y0 / ih);
      const right = clamp01(bbox.x1 / iw);
      const bottom = clamp01(bbox.y1 / ih);
      return {
        x,
        y,
        width: Math.max(0.002, right - x),
        height: Math.max(0.002, bottom - y),
      };
    },

    normalizedToDom(field, pageEl) {
      const pw = pageEl.clientWidth || parseFloat(pageEl.style.width) || 1;
      const ph = pageEl.clientHeight || parseFloat(pageEl.style.height) || 1;
      return {
        x: field.x * pw,
        y: field.y * ph,
        w: field.width * pw,
        h: field.height * ph,
      };
    },

    domToNormalized(rect, pageEl) {
      const pw = pageEl.clientWidth || parseFloat(pageEl.style.width) || 1;
      const ph = pageEl.clientHeight || parseFloat(pageEl.style.height) || 1;
      const width = clamp01(rect.w / pw);
      const height = clamp01(rect.h / ph);
      return {
        x: clamp01(Math.min(rect.x / pw, 1 - width)),
        y: clamp01(Math.min(rect.y / ph, 1 - height)),
        width,
        height,
      };
    },

    domRectToPdfLib(item, pdfLibPage, domPageWidth, domPageHeight, degreesFn) {
      const pw = domPageWidth || 1;
      const ph = domPageHeight || 1;
      const nx = item.x / pw;
      const ny = item.y / ph;
      const nw = item.w / pw;
      const nh = item.h / ph;

      let cb;
      try {
        cb = pdfLibPage.getCropBox();
      } catch (_) {
        const sz = pdfLibPage.getSize();
        cb = { x: 0, y: 0, width: sz.width, height: sz.height };
      }

      const rawAngle = pdfLibPage.getRotation?.()?.angle || 0;
      const rot = ((rawAngle % 360) + 360) % 360;

      let x, y, width, height;
      if (rot === 90) {
        width = nw * cb.height;
        height = nh * cb.width;
        x = cb.x + (ny + nh) * cb.width;
        y = cb.y + nx * cb.height;
      } else if (rot === 180) {
        width = nw * cb.width;
        height = nh * cb.height;
        x = cb.x + (1 - nx) * cb.width;
        y = cb.y + (ny + nh) * cb.height;
      } else if (rot === 270) {
        width = nw * cb.height;
        height = nh * cb.width;
        x = cb.x + (1 - (ny + nh)) * cb.width;
        y = cb.y + (1 - nx) * cb.height;
      } else {
        width = nw * cb.width;
        height = nh * cb.height;
        x = cb.x + nx * cb.width;
        y = cb.y + (1 - ny - nh) * cb.height;
      }

      const fontSize = height * 0.6;
      const localDx = 2;
      const localDy = height * 0.28;
      const rad = (rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const textX = x + localDx * cos - localDy * sin;
      const textY = y + localDx * sin + localDy * cos;

      return {
        x,
        y,
        width,
        height,
        fontSize,
        textX,
        textY,
        rotate: degreesFn ? degreesFn(rot) : undefined,
      };
    },
  };
})(typeof self !== "undefined" ? self : window);
