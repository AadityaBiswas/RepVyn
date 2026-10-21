// The RepVyn mark.
import Svg, { G, Path, Rect } from "react-native-svg";

export const Mark = ({ size = 36 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 344 344">
    <Rect width={344} height={344} rx={77} fill="#DE223D" />
    <G fill="#fff" transform="translate(50.7 70.2) scale(1.7833)">
      <Path d="M8.6 8.4H73A22 22 0 0 1 95 30.4Q95 38 91.5 43.5L80.5 60.4Q69.9 76.7 59.4 60L50 44.5H63A7.15 7.15 0 0 0 63 30.2H25Q20.2 30.2 17.9 26Z" />
      <Path d="M127.9 39.2H111Q103.5 39.2 98.6 46.9L69.4 92.4 44 50.8Q37.2 39.5 27 39.5H24Q8 39.5 15.2 52.8L45.5 99Q50.1 106.1 58 106.1H82Q90.6 106.1 94.8 98.7Z" />
    </G>
  </Svg>
);
