type TabType = "spl" | "inco";

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TabNavigation = ({ activeTab, onTabChange }: TabNavigationProps) => {
  return (
    <div className="flex gap-4 mb-8 border-b border-gray-200">
      <button
        onClick={() => onTabChange("spl")}
        className={`pb-4 px-6 font-semibold transition-colors ${
          activeTab === "spl"
            ? "border-b-2 border-blue-500 text-blue-600"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        SPL Token
      </button>
      <button
        onClick={() => onTabChange("inco")}
        className={`pb-4 px-6 font-semibold transition-colors ${
          activeTab === "inco"
            ? "border-b-2 border-blue-500 text-blue-600"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Zivo Exchange Token
      </button>
    </div>
  );
};

export default TabNavigation;
