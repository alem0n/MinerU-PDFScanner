import { Nav } from "@douyinfe/semi-ui";
import {
  IconGithubLogo,
} from "@douyinfe/semi-icons";
import { IconConfig, IconList, IconRating } from "@douyinfe/semi-icons-lab";

import { useLocation, useNavigate } from "react-router-dom";
import NavFooter from "@douyinfe/semi-ui/lib/es/navigation/Footer";
import { open } from "@tauri-apps/plugin-shell";

export function Menus() {
  const navigate = useNavigate();
  const {pathname} = useLocation()
  return (
    <Nav
      onSelect={(e) => {
        e.itemKey && navigate(e.itemKey.toString());
      }}
      className="h-full  max-w-60 "
      selectedKeys={[pathname]}
      defaultOpenKeys={['/task']}
      items={[
        {
          itemKey: "/createTask",
          text: "创建任务",
          icon: <IconRating  size="large" />,
        },
        {
          itemKey: "/task",
          text: "扫描历史",
          icon: <IconList  size="large" />,
          items: [
            { itemKey: "/task/pending", text: "未启动" },
            { itemKey: "/task/processing", text: "进行中" },
            { itemKey: "/task/completed", text: "已完成" },
            { itemKey: "/task/failed", text: "失败" },
          ],
        },
        {
          itemKey: "/setting",
          text: "设置",
          icon: <IconConfig size="large" />,
        } 
      ]}
      footer={
        <div className="w-full flex flex-col items-center justify-center gap-2">
          <NavFooter className="!p-0" collapseButton />
         <div 
         onClick={()=>open("https://github.com/liuhuapiaoyuan/MinerU-PDFScanner")}
         className="group p-2 cursor-pointer rounded-xl text-center border  hover:shadow-sm flex flex-wrap items-center justify-center">
            <IconGithubLogo size="large" />
            <span className="group-hover:text-[#3477EB] !text-[14px]">
              Github Star{" "}
            </span>
            <span className="!text-[14px] ml-[0.5rem]">🎉</span>
          </div>
        </div>
      }
    />
  );
}
