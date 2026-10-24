import { useId } from 'react';
import logoLayer0 from '../assets/logo-layer-0.png';
import logoLayer1 from '../assets/logo-layer-1.png';

// 与 icon-pc.svg 一致的 logo 轮廓（alpha 蒙版形状）
const MASK_PATH =
  'M13.4892 9.45891C13.8 9.45891 14.1138 9.51538 14.4187 9.6315C17.3732 10.7551 20.0494 12.5816 22.4799 15.0139C22.8677 15.3999 22.8766 16.0527 22.4976 16.4482C20.1737 18.8899 17.4739 20.6788 14.401 21.8211C14.0961 21.9341 13.7822 21.9875 13.4684 21.9875C12.678 21.9875 11.9113 21.6329 11.4198 20.9518C9.69096 18.5604 9.6525 13.1811 11.3014 10.6578C11.8077 9.88258 12.6366 9.45891 13.4892 9.45891ZM13.4892 3C10.6146 3 7.92654 4.48449 6.29536 6.97326C4.24972 10.0992 3.98033 13.9218 4.00105 15.9209C4.02177 17.9609 4.3859 21.8369 6.58548 24.878C8.21666 27.1408 10.73 28.4433 13.4684 28.4433C14.472 28.4433 15.4578 28.2643 16.4052 27.916L16.4111 27.916L16.417 27.9128C20.3395 26.4535 23.8268 24.1404 26.7813 21.0365C28.1283 19.6243 28.8892 17.6659 28.8684 15.6573C28.8477 13.6393 28.0395 11.6903 26.6541 10.3094C23.5664 7.2212 20.1412 4.94583 16.4762 3.55237C15.5171 3.18518 14.5105 3 13.4892 3Z';

export default function LogoLoader() {
  // 每个实例独立 id，避免多实例时 mask 引用冲突
  const maskId = 'plLogoMask-' + useId().replace(/:/g, '');

  return (
    <div className="pl-logo-loader">
      <svg className="pl-logo-svg" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <path fill="#ffffff" d={MASK_PATH} />
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          {/* 底部白色底，被蒙版裁切成 logo 形状，垫在两层图片之下 */}
          <rect x="0" y="0" width="32" height="32" fill="#ffffff" />
          {/* 两层图片严格按原 SVG 的 rect 坐标放置，各自绕自身中心反向旋转 */}
          <g className="pl-spin1">
            <image
              href={logoLayer0}
              x="-1.9287109375"
              y="-21.068321228027344"
              width="52.6952"
              height="56.1778"
              preserveAspectRatio="none"
            />
          </g>
          <g className="pl-spin2">
            <image
              href={logoLayer1}
              x="-26.5"
              y="-5.689449310302734"
              width="63.0566"
              height="64.9654"
              preserveAspectRatio="none"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
