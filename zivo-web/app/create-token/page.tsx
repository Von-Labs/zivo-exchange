"use client";

import { useState } from "react";
import Header from "@/components/header";
import Padder from "@/components/padder";
import SplTokenCreator from "@/components/spl-token-creator";
import IncoTokenCreator from "@/components/inco-token-creator";
import TabNavigation from "@/components/tab-navigation";

type TabType = "spl" | "inco";

const CreateTokenPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>("spl");

  return (
    <Padder>
      <Header />
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Create Token</h1>

        {/* Tab Navigation */}
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {activeTab === "spl" ? <SplTokenCreator /> : <IncoTokenCreator />}
        </div>
      </div>
    </Padder>
  );
};

export default CreateTokenPage;
