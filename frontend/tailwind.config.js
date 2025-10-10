/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"], // dev = main: 소스 스캔 경로
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#F3D54E",
          blue: "#2F67F6",
        },
      },
      boxShadow: {
        soft: "0 8px 20px rgba(0,0,0,0.08)", // dev = main: 카드 그림자
      },
      borderRadius: {
        xl2: "1rem", // 16px
      },
    },
  },
  plugins: [],
};
